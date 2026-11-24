import { useEffect, useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Button, BarraAccion, Card, Field, Input, Select, Sheet, Badge, aviso } from "../../ui/index.jsx";
import { PARAMETROS, validarParametros, guardarParametros, copiarParametros } from "../../store/acciones_admin.js";
import { SelectorSucursal, Nota } from "../../componentes/admin/comunes.jsx";

const texto = (p, v) => String(v ?? "");

export default function Parametros() {
  const { d } = useSesion();
  const [suc, setSuc] = useState(d.sucursales[0].id);
  const guardado = d.params[suc];
  const [v, setV] = useState({ ...guardado });
  const [copiar, setCopiar] = useState(false);
  const [dest, setDest] = useState([]);
  const [claves, setClaves] = useState([]);
  const [cargando, setCargando] = useState(false);
  useEffect(() => { setV({ ...d.params[suc] }); }, [suc, d.params]);

  const errores = useMemo(() => validarParametros(v), [v]);
  const cambiados = PARAMETROS.filter((p) => texto(p, v[p.k]) !== texto(p, guardado[p.k])).map((p) => p.k);
  const hayErr = Object.keys(errores).length > 0;

  const guardar = () => {
    setCargando(true);
    const r = mutar((x) => guardarParametros(x, suc, v));
    setCargando(false);
    r.ok ? aviso(`${r.cambios.length} parámetro(s) guardado(s).`) : aviso(r.error, "bad");
  };
  const abrirCopia = () => { setClaves(cambiados.length ? [] : PARAMETROS.map((p) => p.k)); setDest([]); setCopiar(true); };
  const ejecutarCopia = () => {
    const r = mutar((x) => copiarParametros(x, suc, dest, claves));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Parámetros copiados a ${r.destinos} sucursal(es).`); setCopiar(false);
  };
  const alternar = (arr, set, x) => set(arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);

  return (
    <>
      <SelectorSucursal d={d} valor={suc} onChange={setSuc} />
      <Card tono="info"><p className="txt peq" style={{ margin: 0 }}>Cada cambio queda en la bitácora (valor anterior → nuevo). Los apartados y créditos ya creados conservan las condiciones con que se hicieron.</p></Card>
      <div className="form">
        {PARAMETROS.map((p) => (
          <Field key={p.k} label={`${p.l}${p.u ? ` (${p.u})` : ""}`} hint={p.ayuda} error={errores[p.k]}>
            {p.tipo === "enum"
              ? <Select value={v[p.k]} onChange={(e) => setV({ ...v, [p.k]: e.target.value })}>{p.opciones.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              : <Input value={v[p.k]} onChange={(e) => setV({ ...v, [p.k]: e.target.value })} inputMode={p.tipo === "dias" ? "numeric" : "decimal"} />}
            {cambiados.includes(p.k) && <Badge tono="warn">Modificado (antes: {texto(p, guardado[p.k])})</Badge>}
          </Field>
        ))}
      </div>
      <BarraAccion>
        <Button block loading={cargando} disabled={!cambiados.length || hayErr} onClick={guardar}>Guardar {cambiados.length ? `(${cambiados.length})` : "cambios"}</Button>
        <Button block variante="sec" icon="repeat" disabled={cambiados.length > 0} onClick={abrirCopia}>Copiar a otras sucursales</Button>
        {cambiados.length > 0 && <Nota>Guarda primero para poder copiar.</Nota>}
      </BarraAccion>

      <Sheet abierto={copiar} onClose={() => setCopiar(false)} titulo={`Copiar desde ${d.sucursales.find((s) => s.id === suc).nombre}`}
        pie={<Button block disabled={!dest.length || !claves.length} onClick={ejecutarCopia}>Copiar {claves.length} parámetro(s) a {dest.length} sucursal(es)</Button>}>
        <b>Sucursales destino</b>
        {d.sucursales.filter((s) => s.id !== suc).map((s) => (
          <label key={s.id} className="fila-flex" style={{ minHeight: 44 }}><input type="checkbox" checked={dest.includes(s.id)} onChange={() => alternar(dest, setDest, s.id)} style={{ width: 22, height: 22 }} /> {s.nombre}</label>
        ))}
        <b>Parámetros a copiar</b>
        {PARAMETROS.map((p) => (
          <label key={p.k} className="fila-flex" style={{ minHeight: 44 }}><input type="checkbox" checked={claves.includes(p.k)} onChange={() => alternar(claves, setClaves, p.k)} style={{ width: 22, height: 22 }} /> <span>{p.l}</span></label>
        ))}
      </Sheet>
    </>
  );
}
