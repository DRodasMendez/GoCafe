import type { RoastType } from '@prisma/client'

export const RAW_MATERIALS = ['pergamino', 'oro', 'natural'] as const
export type RawMaterialType = (typeof RAW_MATERIALS)[number]

export type StockMaterial =
  | RawMaterialType
  | 'grano_claro'
  | 'grano_medio'
  | 'grano_oscuro'
  /** Comercial y Especial no son productos distintos — es el mismo café Gourmet, la diferencia es solo la bolsa (ver inventario_empaque_stock: 'comercial' / 'especial'). */
  | 'gourmet'
  | 'blend_bolsas'

export const ALL_MATERIALS: StockMaterial[] = [
  'pergamino',
  'oro',
  'natural',
  'grano_claro',
  'grano_medio',
  'grano_oscuro',
  'gourmet',
  'blend_bolsas',
]

export const STOCK_LABELS: Record<StockMaterial, string> = {
  pergamino: 'Pergamino',
  oro: 'Oro',
  natural: 'Natural',
  grano_claro: 'Café en grano — Tueste Claro',
  grano_medio: 'Café en grano — Tueste Medio',
  grano_oscuro: 'Café en grano — Tueste Oscuro',
  gourmet: 'Gourmet (terminado)',
  blend_bolsas: 'Blend (bolsas de 350 g)',
}

/** Café en grano reservado para cafetería, uno por tipo de tueste. */
export const GRANO_MATERIALS = ['grano_claro', 'grano_medio', 'grano_oscuro'] as const
export type GranoMaterial = (typeof GRANO_MATERIALS)[number]

export const MATERIA_PRIMA_MINIMO_DEFAULT_LB = 25

/** El café en grano tiene una sola alerta, sobre el total de los tres tuestes (ver tabla configuracion). */
export const GRANO_MINIMO_CLAVE = 'grano_cafeteria_minimo_lb'
export const GRANO_MINIMO_DEFAULT_LB = 5

export function granoMaterial(tipo: RoastType): StockMaterial {
  return `grano_${tipo}` as StockMaterial
}
