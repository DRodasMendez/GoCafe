const Q_FORMAT = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Quetzales con separador de miles: 1500 → "Q1,500.00". */
export function formatQ(value: number): string {
  return `Q${Q_FORMAT.format(value)}`
}

/** Convierte lo escrito en un campo de costo: '' → undefined (sin costo), texto inválido o negativo → null. */
export function parseCosto(raw: string): number | undefined | null {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null
}
