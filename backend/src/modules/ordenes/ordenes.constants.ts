// Portado de frontend/src/types/order.ts — deben quedar siempre idénticos a esa lista.
export const PACKAGE_TYPES = [
  'transparente',
  'laminada',
  'trilaminada sin válvula',
  'trilaminada con válvula',
  'kraft sin válvula',
  'kraft con válvula',
] as const

export type PackageType = (typeof PACKAGE_TYPES)[number]
