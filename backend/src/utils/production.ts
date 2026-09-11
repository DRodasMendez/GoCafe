// Portado tal cual de frontend/src/utils/production.ts — mismas constantes y fórmulas,
// para que los cálculos de bolsas/libras den exactamente el mismo resultado en frontend y backend.

export const LB_TO_GRAMS = 453.59237
export const BAG_GRAMS = 350
export const MAX_ROAST_LB = 15

export function lbToGrams(lb: number) {
  return lb * LB_TO_GRAMS
}

export function packagingFromLb(lb: number) {
  const grams = lbToGrams(lb)
  const fullBags = Math.floor(grams / BAG_GRAMS)
  const remainderGrams = grams - fullBags * BAG_GRAMS
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

export function bagsEquivalent(lb: number) {
  const grams = lb * LB_TO_GRAMS
  const fullBags = Math.floor(grams / BAG_GRAMS)
  const remainderGrams = grams - fullBags * BAG_GRAMS
  return { fullBags, remainderGrams }
}
