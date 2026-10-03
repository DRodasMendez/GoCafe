import { PACKAGE_TYPES } from '../ordenes/ordenes.constants'

/** Empaques usados en el módulo de Clientes (el café es del cliente). */
export const CLIENT_PACKAGE_TYPES = PACKAGE_TYPES

/** Empaques usados en Producción propia (Gourmet y Blend comparten estos dos). */
export const PRODUCTION_PACKAGE_TYPES = ['comercial', 'especial'] as const
export type ProductionPackageType = (typeof PRODUCTION_PACKAGE_TYPES)[number]

/** Todos los tipos de empaque válidos para InventarioEmpaqueStock.tipo — una fila por tipo, agregar uno nuevo no requiere migración. */
export const EMPAQUE_TYPES = [...CLIENT_PACKAGE_TYPES, ...PRODUCTION_PACKAGE_TYPES] as const
export type EmpaqueType = (typeof EMPAQUE_TYPES)[number]

export const EMPAQUE_LABELS: Record<EmpaqueType, string> = {
  transparente: 'Transparente',
  laminada: 'Laminada',
  'trilaminada sin válvula': 'Trilaminada sin válvula',
  'trilaminada con válvula': 'Trilaminada con válvula',
  'kraft sin válvula': 'Kraft sin válvula',
  'kraft con válvula': 'Kraft con válvula',
  comercial: 'Bolsa Comercial (Producción propia)',
  especial: 'Bolsa Especial (Producción propia)',
}
