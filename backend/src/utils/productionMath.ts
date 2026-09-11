// Portado de frontend/src/types/production.ts — mismas fórmulas de negocio
// (ratio del Blend y cálculo de merma), para que ambos lados calculen exactamente igual.

export interface RoastBatchLike {
  weightLb: number
}

export function roastedAllocatedLb(roasts: RoastBatchLike[]): number {
  return roasts.reduce((sum, r) => sum + (Number(r.weightLb) || 0), 0)
}

/** Fórmula fija del Blend: 35% café de primera (Pergamino) + 65% café de segunda (Oro o Natural). */
export const BLEND_PERGAMINO_RATIO = 0.35
export const BLEND_SEGUNDA_RATIO = 0.65

export function blendRequiredRawMaterial(cantidadLb: number): { pergaminoLb: number; segundaLb: number } {
  const pergaminoLb = Math.round(cantidadLb * BLEND_PERGAMINO_RATIO * 100) / 100
  const segundaLb = Math.round((cantidadLb - pergaminoLb) * 100) / 100
  return { pergaminoLb, segundaLb }
}

/** Merma total del lote Gourmet: trillado + tueste + molido (la reserva para cafetería no cuenta como merma). */
export function gourmetMermaLb(p: {
  pergaminoUsedLb: number
  trilladoWeightLb: number
  roasts: RoastBatchLike[]
  pesoTuesteResultLb: number
  reservaCafeteriaLb: number
  molidoWeightLb: number
}): number {
  const roastedTotal = roastedAllocatedLb(p.roasts)
  const restanteParaMolido = Math.max(p.pesoTuesteResultLb - p.reservaCafeteriaLb, 0)
  const mermaTrillado = Math.max(p.pergaminoUsedLb - p.trilladoWeightLb, 0)
  const mermaTueste = Math.max(roastedTotal - p.pesoTuesteResultLb, 0)
  const mermaMolido = Math.max(restanteParaMolido - p.molidoWeightLb, 0)
  return mermaTrillado + mermaTueste + mermaMolido
}

/** Merma total del lote Blend: trillado + tueste + molido y mezcla. */
export function blendMermaLb(p: {
  pergaminoUsedLb: number
  segundaUsedLb: number
  trilladoWeightLb: number
  roasts: RoastBatchLike[]
  pesoTuesteResultLb: number
  molidoMezclaWeightLb: number
}): number {
  const totalRawInput = p.pergaminoUsedLb + p.segundaUsedLb
  const roastedTotal = roastedAllocatedLb(p.roasts)
  const mermaTrillado = Math.max(totalRawInput - p.trilladoWeightLb, 0)
  const mermaTueste = Math.max(roastedTotal - p.pesoTuesteResultLb, 0)
  const mermaMolido = Math.max(p.pesoTuesteResultLb - p.molidoMezclaWeightLb, 0)
  return mermaTrillado + mermaTueste + mermaMolido
}
