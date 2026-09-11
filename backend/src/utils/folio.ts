/**
 * Los folios (GC-0001, GG-0001, GB-0001) nunca se guardan como texto: se calculan a partir de
 * la columna "seq" (entero autoincremental de Postgres, atómico por diseño). Esto evita el bug de
 * folios duplicados que tenía la versión con localStorage (leer-e-incrementar-a-mano no es atómico).
 */
export function formatFolio(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(4, '0')}`
}

/** Extrae el número de secuencia de un folio como "GC-0001" para poder buscar por él. Devuelve null si el texto no calza con el formato. */
export function parseFolioSeq(folio: string): number | null {
  const match = /^[A-Z]+-(\d+)$/.exec(folio.trim())
  if (!match) return null
  return parseInt(match[1], 10)
}
