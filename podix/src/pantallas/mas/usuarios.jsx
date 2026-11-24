import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Avatar, Badge, Button, Buscador, Card, Chips, Field, Fila, Icon, Input, Select, Sheet, Vacio, aviso } from "../../ui/index.jsx";
import { normaliza } from "../../lib/format.js";
import { ROLES_USUARIO, DESCRIPCION_ROL, validarUsuario, guardarUsuario, cambiarActivo, maxSucursalesRol } from "../../store/acciones_admin.js";
import { Nota } from "../../componentes/admin/comunes.jsx";

const nombreRol = (r) => (ROLES_USUARIO.find((x) => x.v === r) || {}).l || r;
const VACIO = { id: null, nombre: "", correo: "", rol: "recepcion", sucursales: [] };

export default function Usuarios() {
  const { d, u } = useSesion();
  const [q, setQ] = useState("");
  const [rol, setRol] = useState("todos");
  const [f, setF] = useState(null);       // formulario abierto
  const [roles, setRoles] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const lista = useMemo(() => d.usuarios.filter((x) => (rol === "todos" || x.rol === rol) && (!q || normaliza(`${x.nombre} ${x.correo}`).includes(normaliza(q)))), [d.usuarios, q, rol]);
  const err = f ? validarUsuario(d, f) : {};
  const todas = f && ["admin", "direccion"].includes(f.rol);
  const max = f ? maxSucursalesRol(f.rol) : 1;
  const previo = f && f.id ? d.usuarios.find((x) => x.id === f.id) : null;
  const fijas = todas || (previo && previo.almacenCentral && f.rol === "almacen");
  const nomSuc = (ids) => ids.length === d.sucursales.length ? "Todas" : ids.map((i) => (d.sucursales.find((s) => s.id === i) || {}).nombre).join(", ");

  const marcar = (id) => {
    const s = f.sucursales.includes(id) ? f.sucursales.filter((x) => x !== id) : max === 1 ? [id] : [...f.sucursales, id];
    setF({ ...f, sucursales: s });
  };
  const cambiarRol = (r) => setF({ ...f, rol: r, sucursales: maxSucursalesRol(r) === 1 ? f.sucursales.slice(0, 1) : f.sucursales.slice(0, maxSucursalesRol(r)) });
  const guardar = () => {
    const r = mutar((x) => guardarUsuario(x, f));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(f.id ? "Usuario actualizado." : "Usuario creado."); setF(null);
  };
  const alternar = () => {
    const r = mutar((x) => cambiarActivo(x, f.id, previo.activo === false));
    setConfirmar(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso(previo.activo === false ? "Usuario activado." : "Usuario desactivado."); setF(null);
  };

  return (
    <>
      <Buscador valor={q} onChange={setQ} placeholder="Buscar por nombre o correo…" />
      <Chips scroll opciones={[{ v: "todos", l: "Todos" }, ...ROLES_USUARIO.map((r) => ({ v: r.v, l: r.l }))]} valor={rol} onChange={setRol} />
      <div className="dos">
        <Button block icon="plus" onClick={() => setF({ ...VACIO })}>Nuevo usuario</Button>
        <Button block variante="sec" icon="shield" onClick={() => setRoles(true)}>¿Qué ve cada rol?</Button>
      </div>
      <div className="lista">
        {lista.map((x) => (
          <Fila key={x.id} izquierda={<Avatar nombre={x.nombre} tono={x.activo === false ? "bad" : undefined} />} titulo={x.nombre}
            badge={x.activo === false ? <Badge tono="bad">Inactivo</Badge> : <Badge tono="ok">Activo</Badge>}
            sub={nombreRol(x.rol)} datos={<><span>{nomSuc(x.sucursales)}</span><span>{x.correo}</span></>}
            onClick={() => setF({ id: x.id, nombre: x.nombre, correo: x.correo, rol: x.rol, sucursales: [...x.sucursales] })} />
        ))}
        {!lista.length && <Vacio icon="users">No hay usuarios con ese filtro.</Vacio>}
      </div>

      <Sheet abierto={!!f} onClose={() => setF(null)} titulo={f && f.id ? "Editar usuario" : "Nuevo usuario"}
        pie={f && <Button block disabled={Object.keys(err).length > 0} onClick={guardar}>{f.id ? "Guardar cambios" : "Crear usuario"}</Button>}>
        {f && (<div className="form">
          <Field label="Nombre" error={f.nombre ? err.nombre : undefined}><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoComplete="name" /></Field>
          <Field label="Correo" error={f.correo ? err.correo : undefined}><Input type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} autoComplete="email" /></Field>
          <Field label="Rol" error={err.rol}>
            <Select value={f.rol} onChange={(e) => cambiarRol(e.target.value)} disabled={f.id === u.id}>{ROLES_USUARIO.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</Select>
            <em>{DESCRIPCION_ROL[f.rol]}</em>
          </Field>
          <div className="field"><span>Sucursales asignadas {max < 99 ? `(máx. ${max})` : ""}</span>
            {fijas ? <Nota>Ve las 7 sucursales.</Nota> : d.sucursales.map((s) => {
              const on = f.sucursales.includes(s.id);
              return <label key={s.id} className="fila-flex" style={{ minHeight: 44, opacity: !on && max > 1 && f.sucursales.length >= max ? 0.5 : 1 }}>
                <input type={max === 1 ? "radio" : "checkbox"} name="suc" checked={on} disabled={!on && max > 1 && f.sucursales.length >= max} onChange={() => marcar(s.id)} style={{ width: 22, height: 22 }} /> {s.nombre}</label>;
            })}
            {err.sucursales && <strong>{err.sucursales}</strong>}
          </div>
          {previo && previo.id !== u.id && (
            <Button block variante={previo.activo === false ? "ok" : "danger"} onClick={() => setConfirmar(true)}>{previo.activo === false ? "Activar usuario" : "Desactivar usuario"}</Button>
          )}
          {previo && previo.activo === false && <Nota><Icon name="lock" size={14} /> Un usuario inactivo no debe poder entrar: el inicio de sesión respeta la marca de inactivo.</Nota>}
        </div>)}
      </Sheet>

      <Sheet abierto={confirmar} onClose={() => setConfirmar(false)} titulo={previo && previo.activo === false ? "Activar usuario" : "Desactivar usuario"}
        pie={<div className="dos"><Button variante="sec" block onClick={() => setConfirmar(false)}>Cancelar</Button><Button block variante={previo && previo.activo === false ? "primary" : "danger"} onClick={alternar}>Confirmar</Button></div>}>
        <p className="txt">{previo && previo.activo === false ? "El usuario podrá volver a iniciar sesión." : "El usuario ya no podrá iniciar sesión. Su historial se conserva."}</p>
      </Sheet>

      <Sheet abierto={roles} onClose={() => setRoles(false)} titulo="Qué ve cada rol">
        {ROLES_USUARIO.map((r) => <Card key={r.v}><b>{r.l}</b><p className="txt peq" style={{ margin: "4px 0 0" }}>{DESCRIPCION_ROL[r.v]}</p></Card>)}
        <Nota>Los permisos también se validan en el dato, no solo en los botones (MATRIZ_ROLES.md).</Nota>
      </Sheet>
    </>
  );
}
