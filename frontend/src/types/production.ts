// Módulo de Producción Go Café: café que la empresa compra y produce para su propio consumo,
// para abastecer las cafeterías y para la venta. No tiene relación con el módulo de Clientes
// (ahí el café es del cliente; aquí el café es de Go Café).

export type RawMaterialType = 'pergamino' | 'oro' | 'natural'

export const RAW_MATERIAL_LABELS: Record<RawMaterialType, string> = {
  pergamino: 'Pergamino',
  oro: 'Oro',
  natural: 'Natural',
}

/** "Oro" y "Natural" son ambos café de segunda; el Blend usa uno u otro, nunca ambos a la vez. */
export type SegundaType = Extract<RawMaterialType, 'oro' | 'natural'>

export type PackagingType = 'comercial' | 'especial'

export const PACKAGING_LABELS: Record<PackagingType, string> = {
  comercial: 'Comercial',
  especial: 'Especial',
}

export const ROAST_TYPES = ['claro', 'medio', 'oscuro'] as const
export type RoastType = typeof ROAST_TYPES[number]

export const ROAST_TYPE_LABELS: Record<RoastType, string> = {
  claro: 'Claro',
  medio: 'Medio',
  oscuro: 'Oscuro',
}

export type ProductionStatus = 'en_proceso' | 'terminada'

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  en_proceso: 'En proceso',
  terminada: 'Terminada',
}

/** Un tueste solo registra el peso que se le asigna (igual que en el módulo de Clientes); la merma se ve en el paso siguiente al comparar contra el peso resultante. */
export interface RoastBatch {
  id: number
  weightLb: number
  notes: string
}

export const GOURMET_STEPS = ['Pergamino', 'Trillado', 'Tueste', 'Reserva para cafetería', 'Molido', 'Empaque', 'Resumen'] as const
export type GourmetStep = typeof GOURMET_STEPS[number]

export interface GourmetProduction {
  id: string
  code: string
  type: 'gourmet'
  status: ProductionStatus
  currentStepName: GourmetStep
  fecha: string
  pergaminoUsedLb: number
  trilladoWeightLb: number
  roastType: RoastType
  roasts: RoastBatch[]
  pesoTuesteResultLb: number
  reservaCafeteriaLb: number
  molidoWeightLb: number
  /** Comercial y Especial no son productos distintos — es el mismo café Gourmet, la diferencia es solo la bolsa (ver comercialBags/especialBags). */
  actualFullBags: number
  actualRemainderGrams: number
  /** Reparto de actualFullBags entre los dos tipos de bolsa física (inventario de empaque): comercialBags + especialBags debe sumar actualFullBags. */
  comercialBags: number
  especialBags: number
  notas: string
  createdAt: string
  updatedAt: string
  finalizedAt: string | null
}

export const BLEND_STEPS = ['Planificación', 'Trillado', 'Tueste', 'Molido y mezcla', 'Empaque', 'Resumen'] as const
export type BlendStep = typeof BLEND_STEPS[number]

export interface BlendProduction {
  id: string
  code: string
  type: 'blend'
  status: ProductionStatus
  currentStepName: BlendStep
  fecha: string
  cantidadPlanificadaLb: number
  segundaType: SegundaType
  pergaminoUsedLb: number
  segundaUsedLb: number
  trilladoWeightLb: number
  roasts: RoastBatch[]
  pesoTuesteResultLb: number
  molidoMezclaWeightLb: number
  actualFullBags: number
  actualRemainderGrams: number
  /** Tipo de bolsa física (inventario de empaque) usada para las actualFullBags de este lote. */
  bagType: PackagingType
  notas: string
  createdAt: string
  updatedAt: string
  finalizedAt: string | null
}

export type Production = GourmetProduction | BlendProduction

/** Total asignado a tuestes (peso que entra al tostador). La merma se observa al comparar contra el peso del siguiente paso. */
export function roastedAllocatedLb(roasts: RoastBatch[]): number {
  return roasts.reduce((sum, r) => sum + (Number(r.weightLb) || 0), 0)
}

/** Fórmula fija del Blend: 35% café de primera (Pergamino) + 65% café de segunda (Oro o Natural). */
export const BLEND_PERGAMINO_RATIO = 0.35
export const BLEND_SEGUNDA_RATIO = 0.65

export function blendRequiredRawMaterial(cantidadLb: number): { pergaminoLb: number, segundaLb: number } {
  const pergaminoLb = Math.round(cantidadLb * BLEND_PERGAMINO_RATIO * 100) / 100
  const segundaLb = Math.round((cantidadLb - pergaminoLb) * 100) / 100
  return { pergaminoLb, segundaLb }
}

/** Desglose de merma por paso, más el total (suma de los tres). */
export interface MermaBreakdown {
  mermaTrillado: number
  mermaTueste: number
  mermaMolido: number
  total: number
}

/** Merma por paso (trillado, tueste, molido) — la reserva para cafetería no cuenta como merma, se aparta a propósito. */
export function gourmetMermaLb(p: Pick<GourmetProduction, 'pergaminoUsedLb' | 'trilladoWeightLb' | 'roasts' | 'pesoTuesteResultLb' | 'reservaCafeteriaLb' | 'molidoWeightLb'>): MermaBreakdown {
  const roastedTotal = roastedAllocatedLb(p.roasts)
  const restanteParaMolido = Math.max(p.pesoTuesteResultLb - p.reservaCafeteriaLb, 0)
  const mermaTrillado = Math.max(p.pergaminoUsedLb - p.trilladoWeightLb, 0)
  const mermaTueste = Math.max(roastedTotal - p.pesoTuesteResultLb, 0)
  const mermaMolido = Math.max(restanteParaMolido - p.molidoWeightLb, 0)
  return { mermaTrillado, mermaTueste, mermaMolido, total: mermaTrillado + mermaTueste + mermaMolido }
}

/** Merma por paso (trillado, tueste, molido y mezcla). */
export function blendMermaLb(p: Pick<BlendProduction, 'pergaminoUsedLb' | 'segundaUsedLb' | 'trilladoWeightLb' | 'roasts' | 'pesoTuesteResultLb' | 'molidoMezclaWeightLb'>): MermaBreakdown {
  const totalRawInput = p.pergaminoUsedLb + p.segundaUsedLb
  const roastedTotal = roastedAllocatedLb(p.roasts)
  const mermaTrillado = Math.max(totalRawInput - p.trilladoWeightLb, 0)
  const mermaTueste = Math.max(roastedTotal - p.pesoTuesteResultLb, 0)
  const mermaMolido = Math.max(p.pesoTuesteResultLb - p.molidoMezclaWeightLb, 0)
  return { mermaTrillado, mermaTueste, mermaMolido, total: mermaTrillado + mermaTueste + mermaMolido }
}
