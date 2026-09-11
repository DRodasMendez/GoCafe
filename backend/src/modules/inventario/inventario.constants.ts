import type { RoastType } from '@prisma/client'

export const RAW_MATERIALS = ['pergamino', 'oro', 'natural'] as const
export type RawMaterialType = (typeof RAW_MATERIALS)[number]

export type StockMaterial =
  | RawMaterialType
  | 'grano_claro'
  | 'grano_medio'
  | 'grano_oscuro'
  | 'gourmet_comercial'
  | 'gourmet_especial'
  | 'blend_bolsas'

export const ALL_MATERIALS: StockMaterial[] = [
  'pergamino',
  'oro',
  'natural',
  'grano_claro',
  'grano_medio',
  'grano_oscuro',
  'gourmet_comercial',
  'gourmet_especial',
  'blend_bolsas',
]

export const STOCK_LABELS: Record<StockMaterial, string> = {
  pergamino: 'Pergamino',
  oro: 'Oro',
  natural: 'Natural',
  grano_claro: 'Café en grano — Tueste Claro',
  grano_medio: 'Café en grano — Tueste Medio',
  grano_oscuro: 'Café en grano — Tueste Oscuro',
  gourmet_comercial: 'Gourmet Comercial',
  gourmet_especial: 'Gourmet Especial',
  blend_bolsas: 'Blend (bolsas de 350 g)',
}

export function granoMaterial(tipo: RoastType): StockMaterial {
  return `grano_${tipo}` as StockMaterial
}
