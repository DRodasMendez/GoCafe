/** "trilaminada sin válvula" → "Trilaminada sin válvula". Los valores se guardan en minúscula; así se muestran. */
export function capitalize(value: string | null | undefined): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '—'
}
