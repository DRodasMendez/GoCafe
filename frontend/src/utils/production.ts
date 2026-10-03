export const LB_TO_GRAMS = 453.59237
export const BAG_GRAMS = 350
export const MAX_ROAST_LB = 15

export function lbToGrams(lb: number) { return lb * LB_TO_GRAMS }
/** bagGrams es opcional porque Producción propia siempre usa bolsas de 350 g; Clientes pasa el gramaje propio de cada orden (ver Order.bagSizeGrams). */
export function packagingFromLb(lb: number, bagGrams: number = BAG_GRAMS) {
  const grams = lbToGrams(lb)
  const fullBags = Math.floor(grams / bagGrams)
  const remainderGrams = grams - fullBags * bagGrams
  return { grams, fullBags, remainderGrams }
}

/** Convierte una cantidad de bolsas completas de 350 g a su equivalente en libras. */
export function bagsToLb(bags: number): number {
  return (bags * BAG_GRAMS) / LB_TO_GRAMS
}

/** Peso real empacado de un lote (bolsas completas + sobrante en gramos), convertido a libras. */
export function packagedWeightLb(fullBags: number, remainderGrams: number): number {
  return (fullBags * BAG_GRAMS + remainderGrams) / LB_TO_GRAMS
}

/** Fecha de una `Date` en horario local, como "YYYY-MM-DD" (a diferencia de `toISOString()`, que usa UTC y puede adelantar o atrasar un día). */
export function localISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Fecha de hoy en horario local. */
export function todayISODate(): string {
  return localISODate(new Date())
}
