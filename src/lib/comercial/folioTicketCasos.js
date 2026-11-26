// Casos compartidos por la prueba JS y por scripts/test-folio-ticket-qa.mjs (paridad SQL = JS).
export const CASOS_FORMATO = [
  { f: '{SUC}-{AAMMDD}-{NNN}', r: 'diario', cod: '01', fecha: '2026-11-26', n: 3, folio: '01-261126-003', periodo: 'D2026-11-26' },
  { f: '{SUC}-{AAMMDD}-{NNN}', r: 'diario', cod: '02', fecha: '2027-01-05', n: 12, folio: '02-270105-012', periodo: 'D2027-01-05' },
  { f: '{SUC}{AAMMDD}{NNN}', r: 'diario', cod: '01', fecha: '2026-11-26', n: 1, folio: '01261126001', periodo: 'D2026-11-26' },
  { f: '{SUC}-{AAAA}{MM}-{NNNN}', r: 'mensual', cod: '03', fecha: '2026-02-28', n: 45, folio: '03-202602-0045', periodo: 'M2026-02' },
  { f: 'T{SUC}/{AA}/{NNNNNN}', r: 'anual', cod: '01', fecha: '2026-12-31', n: 999999, folio: 'T01/26/999999', periodo: 'A2026' },
  { f: '{SUC}-{NNNNNN}', r: 'nunca', cod: '01', fecha: '2026-11-26', n: 36, folio: '01-000036', periodo: 'N' },
  { f: '{SUC}-{AAMMDD}-{NNN}', r: 'diario', cod: '01', fecha: '2026-11-26', n: 1000, folio: '01-261126-1000', periodo: 'D2026-11-26' }, // el número crece, no se trunca
  { f: '{SUC}.{DD}.{MM}.{AAAA}-{NN}', r: 'diario', cod: '09', fecha: '2026-03-07', n: 7, folio: '09.07.03.2026-07', periodo: 'D2026-03-07' },
]
// Cada formato inválido con un fragmento del motivo esperado.
export const CASOS_INVALIDOS = [
  { f: '{AAMMDD}-{NNN}', r: 'diario', msg: /\{SUC\}/ },
  { f: '{SUC}-{AAMMDD}', r: 'diario', msg: /consecutivo/ },
  { f: '{SUC}-{N}', r: 'nunca', msg: /2 dígitos/ },
  { f: '{SUC}-{NNN}-{NNN}', r: 'nunca', msg: /exactamente un consecutivo/ },
  { f: '{SUC} {NNN}', r: 'nunca', msg: /letras, dígitos/ },
  { f: '{SUC}#{NNN}', r: 'nunca', msg: /letras, dígitos/ },
  { f: '{SUC}-{XYZ}-{NNN}', r: 'nunca', msg: /no existe/ },
  { f: 'ABCDEFGHIJKLMNOPQRS{SUC}-{NNN}', r: 'nunca', msg: /máximo es 24/ },
  { f: '{SUC}-{NNN}', r: 'diario', msg: /año, el mes y el día/ },
  { f: '{SUC}-{AAMMDD}-{NNN}', r: 'semanal', msg: /reinicio/ },
  { f: '{SUC}-{AA}-{NNN}', r: 'mensual', msg: /año y el mes/ },
  { f: '{SUC}-{NNN}', r: 'anual', msg: /año/ },
  { f: '{SUC}-{AA}{MM}-{NNN}', r: 'diario', msg: /día/ },
  { f: '{SUC}{SUC}-{NNN}', r: 'nunca', msg: /exactamente un \{SUC\}/ },
  { f: '', r: 'nunca', msg: /vacío/ },
  { f: '{SUC}-{NNNNNNNNNN}', r: 'nunca', msg: /9 dígitos/ },
]
