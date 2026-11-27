-- 326 · Foto del voucher de la terminal en pagos con tarjeta (opcional).
-- Solo guarda la ruta del archivo en el bucket privado «comprobantes» (<organizacion_id>/caja-tarjeta/<uuid>.jpg); se muestra con URL firmada.
-- El frontend solo envía esta columna cuando hay foto, así que el cobro sigue funcionando aunque la migración aún no esté aplicada en un ambiente.
alter table piefirme.pagos add column if not exists comprobante_path text;
comment on column piefirme.pagos.comprobante_path is 'Ruta en el bucket comprobantes de la foto del voucher de la terminal (pagos con tarjeta); opcional.';
