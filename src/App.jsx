import { Suspense, isValidElement, createElement, useEffect, Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, matchPath } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AppProvider, useApp } from './context/AppContext'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import MobileShell from './components/layout/MobileShell'
import Footer from './components/layout/Footer'
import BannerEstado from './components/layout/BannerEstado'
import LoadingSpinner from './components/ui/LoadingSpinner'
import { obtenerRutas, rutaLiberada } from './lib/registro'
import { rolPermitido, puede } from './lib/permisos'
import { registrarError, instalarCapturaErrores } from './lib/errores'
import Login from './pages/Login'
import RecuperarContrasena from './pages/auth/RecuperarContrasena'
import RestablecerContrasena from './pages/auth/RestablecerContrasena'
import Forbidden from './pages/sistema/Forbidden'
import NoLiberada from './pages/sistema/NoLiberada'
import NotFound from './pages/sistema/NotFound'
import Suspendida from './pages/sistema/Suspendida'
import SinPerfil from './pages/sistema/SinPerfil'

// Evita la pantalla en blanco si un módulo falla al renderizar: el resto de la app sigue funcionando.
class LimiteError extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { registrarError({ ruta: this.props.ruta, mensaje: error?.message ?? String(error), detalle: `${error?.stack ?? ''}\n${info?.componentStack ?? ''}` }) }
  componentDidUpdate(prev) { if (prev.ruta !== this.props.ruta && this.state.error) this.setState({ error: null }) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="pagina"><div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <h2 style={{ marginBottom: 8 }}>Algo salió mal en esta pantalla</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>{String(this.state.error.message ?? this.state.error)}</p>
        <button className="btn" onClick={() => window.location.reload()}>Recargar</button>
      </div></div>
    )
  }
}

// Rol (y capacidad opcional) exigidos por la ruta; si no los cumple, muestra el 403 sin cambiar la URL.
function RutaProtegida({ ruta }) {
  const { rol, soloLectura, liberacion } = useApp()
  useEffect(() => { document.title = ruta.titulo ? `${ruta.titulo} · Pie Firme` : 'Pie Firme' }, [ruta.titulo])
  const ok = rolPermitido(rol, ruta.roles, ruta.path) && (!ruta.cap || puede(rol, ruta.cap, { soloLectura: false }))
  if (!ok) return <Forbidden />
  if (!rutaLiberada(ruta.path, liberacion, rol)) return <NoLiberada />   // opción aún no liberada por RANNIX para este rol
  const El = ruta.element
  return isValidElement(El) ? El : createElement(El)
}

// Marco según dispositivo: celular → MobileShell (barra inferior); escritorio → Header + Sidebar + Footer.
function Marco({ children }) {
  const { sidebarOpen, isMobile } = useApp()
  const { pathname } = useLocation()
  const contenido = <LimiteError ruta={pathname}><Suspense fallback={<LoadingSpinner />}>{children}</Suspense></LimiteError>
  if (isMobile) return <MobileShell><BannerEstado />{contenido}</MobileShell>
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header />
      <Sidebar />
      <main style={{
        marginLeft: sidebarOpen ? 'var(--sidebar-width)' : 'var(--sidebar-width-colapsado)', marginTop: 'var(--header-height)',
        minHeight: 'calc(100vh - var(--header-height))', display: 'flex', flexDirection: 'column', transition: 'margin-left .2s ease',
      }}>
        <BannerEstado />
        <div style={{ flex: 1 }}>{contenido}</div>
        <Footer />
      </main>
    </div>
  )
}

function Rutas() {
  const { user, perfil, loading, errorPerfil } = useApp()
  const location = useLocation()
  const rutas = obtenerRutas()
  useEffect(() => { if (perfil) instalarCapturaErrores() }, [perfil])

  // Rutas PÚBLICAS (`publica: true` en src/routes/*.jsx, p. ej. portal del paciente): sin sesión y sin marco de la app.
  const publicas = rutas.filter(r => r.publica)
  if (publicas.some(r => matchPath({ path: r.path, end: true }, location.pathname))) {
    return (
      <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LoadingSpinner /></div>}>
        <Routes>{publicas.map(r => { const El = r.element; return <Route key={r.path} path={r.path} element={isValidElement(El) ? El : <El />} /> })}</Routes>
      </Suspense>
    )
  }

  if (loading)return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LoadingSpinner label="Iniciando Pie Firme..." /></div>

  // Restablecer contraseña funciona con y sin sesión (el enlace del correo abre una sesión de recuperación)
  if (location.pathname === '/restablecer') return <RestablecerContrasena />

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/recuperar" element={<RecuperarContrasena />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ desde: location.pathname + location.search }} />} />
      </Routes>
    )
  }
  if (!perfil) return errorPerfil ? <SinPerfil mensaje={errorPerfil} /> : <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LoadingSpinner label="Cargando tu clínica..." /></div>

  return (
    <Marco>
      <Routes>
        {rutas.map(r => <Route key={r.path} path={r.path} element={<RutaProtegida ruta={r} />} />)}
        <Route path="/login" element={<Navigate to={location.state?.desde ?? '/'} replace />} />
        <Route path="/recuperar" element={<Navigate to="/" replace />} />
        <Route path="/403" element={<Forbidden />} />
        <Route path="/suspendida" element={<Suspendida />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Marco>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AppProvider>
        <Rutas />
        <Toaster position="top-right" toastOptions={{ style: { fontSize: 13 } }} />
      </AppProvider>
    </BrowserRouter>
  )
}
