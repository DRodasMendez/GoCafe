import { todayISODate } from './production'

const DATE_FORMAT = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })

/** "2026-10-13" → "13 oct 2026". Se arma en hora local para que no se corra un día. */
export function formatISODate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return '—'
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return DATE_FORMAT.format(new Date(y, m - 1, d))
}

/** ¿Ya pasó la fecha (YYYY-MM-DD)? Hoy todavía no cuenta como atrasado. */
export function isOverdue(value: string | null | undefined): boolean {
  return Boolean(value) && value!.slice(0, 10) < todayISODate()
}
