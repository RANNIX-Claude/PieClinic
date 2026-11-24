// Borra lo que crea el recorrido (cita nueva, su consulta y su cobro) para poder repetir la demo. Solo QA.
import { ambiente, conectar } from "../scripts/lib/env.mjs";
const bd = await conectar(ambiente("qa"));
const ids = (await bd.query("select id from piefirme.citas where notas like 'Dolor en el dedo gordo del pie derecho%'")).rows.map((r) => r.id);
console.log("citas de la demo:", ids.length);
if (ids.length) {
  try {
    await bd.query("begin");
    await bd.query("set local session_replication_role = replica");
    await bd.query("select set_config('app.ignorar_cierre','on',true)");
    await bd.query("alter table piefirme.turnos_caja disable trigger user");
    const fk = await bd.query(`select conrelid::regclass::text t, a.attname c from pg_constraint k join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1]
      where k.contype='f' and k.confrelid='piefirme.citas'::regclass`);
    console.log("tablas que referencian citas:", fk.rows.map((r) => r.t).join(", "));
    await bd.query("delete from piefirme.pagos where venta_id in (select id from piefirme.ventas where cita_id = any($1))", [ids]);
    await bd.query("delete from piefirme.venta_lineas where venta_id in (select id from piefirme.ventas where cita_id = any($1))", [ids]);
    await bd.query("delete from piefirme.ventas where cita_id = any($1)", [ids]);
    await bd.query("alter table piefirme.turnos_caja enable trigger user");
    for (const t of ["consultas","citas"]) await bd.query(`alter table piefirme.${t} disable trigger user`);
    await bd.query("delete from piefirme.consultas where cita_id = any($1)", [ids]);
    await bd.query("delete from piefirme.citas where id = any($1)", [ids]);
    for (const t of ["consultas","citas"]) await bd.query(`alter table piefirme.${t} enable trigger user`);
    await bd.query("commit");
    console.log("✓ reiniciado");
  } catch (e) { await bd.query("rollback"); console.error("ERROR:", e.message); process.exitCode = 1; }
}
await bd.end();
