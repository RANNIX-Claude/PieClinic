// Piezas compartidas del dominio «expediente»: buscador de pacientes (Vista mosaico/renglones), selección por ?p=,
// cabecera del paciente, avisos y hoja de firma en pantalla (reutiliza el lienzo de firma de recepción).
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Vista, { Foto } from "../../ui/vista.jsx";
import { Badge, Buscador, Button, Chips, Sheet, Card, useDebounced } from "../../ui/index.jsx";
import Firma from "../recepcion/Firma.jsx";
import { fechaCorta } from "../../lib/format.js";
import * as A from "../../store/acciones_expediente.js";

/** Paciente elegido en la URL (?p=PA12) para enlazar entre pantallas del expediente. */
export function usePacienteSel() {
  const [sp, setSp] = useSearchParams();
  const id = sp.get("p");
  const set = (nuevo, extra = {}) => { const q = new URLSearchParams(sp); if (nuevo) q.set("p", nuevo); else q.delete("p"); for (const [k, v] of Object.entries(extra)) v == null ? q.delete(k) : q.set(k, v); setSp(q); };
  return [id, set, sp];
}

export const Aviso = ({ tono = "info", children }) => <div className={`exp-aviso exp-aviso-${tono}`}>{children}</div>;
export const Seccion = ({ titulo, derecha, children }) => (
  <section className="exp-sec"><div className="exp-sec-t"><h3>{titulo}</h3>{derecha}</div>{children}</section>
);

/** Buscador con filtros y Vista (mosaico | renglones). */
export function BuscadorPacientes({ d, u, sucursalId, onElegir, id = "exp-pacientes", extra }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState(u?.rol === "podologo" ? "mios" : "sucursal");
  const dq = useDebounced(q, 180);
  const items = useMemo(() => {
    const op = { max: 150 };
    if (filtro === "mios") op.soloMios = u.id;
    if (filtro === "sucursal") op.sucursalId = sucursalId;
    let l = A.buscarPacientes(d, dq, op);
    if (filtro === "pendientes") l = A.buscarPacientes(d, dq, { max: 400 }).filter((p) => A.pendientesPaciente(d, p).length).slice(0, 150);
    return l.map((p) => ({ ...p, _ult: A.ultimaVisita(d, p.id), _pend: A.pendientesPaciente(d, p).length, _nom: A.nombreCompleto(p) }));
  }, [d, dq, filtro, u, sucursalId]);
  const opciones = [
    ...(u?.rol === "podologo" ? [{ v: "mios", l: "Mis pacientes" }] : []),
    { v: "sucursal", l: "Esta sucursal" }, { v: "todos", l: "Toda la clínica" }, { v: "pendientes", l: "Con pendientes" },
  ];
  const suc = (sid) => d.sucursales.find((s) => s.id === sid)?.nombre ?? sid;
  return (
    <div>
      <div className="exp-busca"><Buscador valor={q} onChange={setQ} placeholder="Nombre, expediente, teléfono o correo" />{extra}</div>
      <Chips opciones={opciones} valor={filtro} onChange={setFiltro} scroll />
      <Vista id={id} items={items} onAbrir={(p) => onElegir(p.id)} vacio="Sin pacientes con ese criterio." minTarjeta={210}
        tarjeta={(p) => (
          <div className="persona">
            <div className="persona-top" />
            <Foto nombre={p._nom} size={56} />
            <div className="persona-n">{p._nom}</div>
            <div className="persona-s">{p.folioManual || p.folio}</div>
            <div className="persona-b">
              <Badge tono="neutral">{A.textoEdad(p.nacimiento)}</Badge>
              {A.esMenorDeEdad(p.nacimiento) && <Badge tono="info">Menor</Badge>}
              {p._pend > 0 && <Badge tono="warn">{p._pend} pendiente{p._pend > 1 ? "s" : ""}</Badge>}
            </div>
            <div className="persona-d"><span><b>{p._ult ? fechaCorta(p._ult) : "—"}</b>última visita</span><span><b>{suc(p.sucursalAlta)}</b>registro</span></div>
          </div>
        )}
        columnas={[
          { k: "n", t: "Paciente", v: (p) => p._nom, orden: (p) => p._nom },
          { k: "f", t: "Expediente", v: (p) => p.folioManual || p.folio },
          { k: "e", t: "Edad", v: (p) => A.textoEdad(p.nacimiento), orden: (p) => A.calcularEdad(p.nacimiento) ?? -1, der: true },
          { k: "t", t: "Teléfono", v: (p) => p.telefono },
          { k: "s", t: "Sucursal", v: (p) => suc(p.sucursalAlta) },
          { k: "u", t: "Última visita", v: (p) => (p._ult ? fechaCorta(p._ult) : "—"), orden: (p) => p._ult || "" },
          { k: "p", t: "Pendientes", v: (p) => (p._pend ? <Badge tono="warn">{p._pend}</Badge> : "—"), orden: (p) => p._pend, der: true },
        ]} />
    </div>
  );
}

/** Cabecera del paciente con edad, expediente, alertas y pendientes. */
export function CabeceraPaciente({ d, p, onCambiar, clinico, children }) {
  const pend = A.pendientesPaciente(d, p);
  const al = clinico ? A.alergiasDe(d, p.id) : [];
  return (
    <Card className="exp-cab">
      <div className="exp-cab-f">
        <Foto nombre={A.nombreCompleto(p)} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="exp-cab-n">{A.nombreCompleto(p)}</div>
          <div className="mu peq">{p.folioManual || p.folio} · {A.textoEdad(p.nacimiento)} · {p.sexo === "F" ? "Mujer" : p.sexo === "M" ? "Hombre" : "—"} · {p.telefono}</div>
          <div className="exp-cab-b">
            {clinico && (p.alertas || []).map((a) => <Badge key={a} tono={/Anticoag|Alergia/.test(a) ? "bad" : "warn"}>{a}</Badge>)}
            {clinico && al.filter((x) => !(p.alertas || []).some((a) => a.includes(x.sustancia))).map((x) => <Badge key={x.id} tono="bad">Alergia: {x.sustancia}</Badge>)}
            {p.tutor?.nombre && A.esMenorDeEdad(p.nacimiento) && <Badge tono="info">Tutor: {p.tutor.nombre}</Badge>}
            <Badge tono={p.avisoFirmado ? "ok" : "bad"}>{p.avisoFirmado ? "Aviso firmado" : "Sin aviso de privacidad"}</Badge>
          </div>
        </div>
        {onCambiar && <Button variante="ghost" icon="back" onClick={onCambiar}>Otro</Button>}
      </div>
      {pend.map((x, i) => <Aviso key={i} tono={x.tono}>{x.texto}</Aviso>)}
      {children}
    </Card>
  );
}

/** Hoja con lienzo de firma. onFirmar(dataURL). */
export function FirmaSheet({ abierto, onClose, titulo = "Firma en pantalla", texto, onFirmar, confirmar = "Firmar", children }) {
  const [img, setImg] = useState("");
  const cerrar = () => { setImg(""); onClose(); };
  return (
    <Sheet abierto={abierto} onClose={cerrar} titulo={titulo}
      pie={<div className="dos"><Button variante="sec" block onClick={cerrar}>Cancelar</Button><Button block disabled={!img} onClick={() => { const x = img; setImg(""); onFirmar(x); }}>{confirmar}</Button></div>}>
      {texto && <div className="exp-texto-legal">{texto}</div>}
      {children}
      {abierto && <Firma onChange={setImg} alto={150} />}
      <p className="mu peq">La firma se guarda con la fecha, la hora, quien la registró, la sucursal y la versión del texto aceptado.</p>
    </Sheet>
  );
}

/** Ilustración de demostración para fotos de la semilla (sin imagen real). `grado` 0–1 = intensidad de la lesión. */
export function FotoDemo({ foto, alto = 120 }) {
  if (foto.data) return <img src={foto.data} alt={`Foto ${foto.momento}`} className="exp-foto-img" style={{ height: alto }} />;
  const g = foto.demo?.grado ?? 0.5, una = foto.demo?.tipo !== "callo";
  const piel = "#f1d2bd", les = `rgba(${una ? "150,120,40" : "190,150,110"},${0.25 + g * 0.7})`;
  return (
    <svg viewBox="0 0 120 90" className="exp-foto-img" style={{ height: alto }} role="img" aria-label="Ilustración de demostración">
      <rect width="120" height="90" fill="#2d2a33" />
      {una ? (<>
        <ellipse cx="60" cy="58" rx="34" ry="40" fill={piel} />
        <ellipse cx="60" cy="38" rx={18} ry={15} fill="#f7e9de" stroke="#caa58c" />
        <ellipse cx="60" cy={38 + (1 - g) * 4} rx={6 + g * 12} ry={4 + g * 10} fill={les} />
      </>) : (<>
        <path d="M20 90 C22 40 40 10 60 10 C82 10 98 40 100 90 Z" fill={piel} />
        <circle cx="62" cy="48" r={5 + g * 12} fill={les} />
      </>)}
      <text x="4" y="86" fontSize="7" fill="#fff">Ilustración demo</text>
    </svg>
  );
}
