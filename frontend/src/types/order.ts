export const PACKAGE_TYPES = [
  'transparente',
  'laminada',
  'trilaminada sin válvula',
  'trilaminada con válvula',
  'kraft sin válvula',
  'kraft con válvula',
] as const

export type PackageType = typeof PACKAGE_TYPES[number]
export type PackageAllocation = Record<PackageType, number>

export type CoffeeType = 'pergamino' | 'natural' | 'oro'

export const COFFEE_TYPE_LABELS: Record<CoffeeType, string> = {
  pergamino: 'Pergamino',
  natural: 'Natural',
  oro: 'Oro',
}

// "Oro" sigue exactamente el mismo flujo que "Natural" (Recepción → Limpieza → Trillado →
// Tuestes); la única diferencia entre ambos es el nombre mostrado al usuario.
export function coffeeTypeHasCleaningStep(coffeeType: CoffeeType): boolean {
  return coffeeType === 'natural' || coffeeType === 'oro'
}

export interface Roast {
  id: number
  weightLb: number
  initialTemp: number
  returnTemp: number
  returnTime: string
  dehydrationTemp: number
  dehydrationTime: string
  caramelizationTemp: number
  caramelizationTime: string
  crackTemp: number
  crackTime: string
  finalTemp: number
  finalTime: string
  notes: string
}

export const STATUS_ORDER = [
  'Recibido',
  'En preparación',
  'En tueste',
  'En molienda',
  'En empaque',
  'Finalizado',
] as const

export type OrderStatus = typeof STATUS_ORDER[number]

export interface Order {
  id: string
  orderNo: string
  clientId: string
  clientName: string
  phone: string
  city: string
  receivedDate: string
  estimatedDate: string
  coffeeType: CoffeeType
  initialWeight: number
  humidity: number
  cleaningWeight: number
  threshingWeight: number
  roasts: Roast[]
  finalWeight: number
  roastType: string
  grindType: string
  totalPrice: number
  /** Si ya se cobró la factura de esta orden (se puede marcar desde Facturación). */
  pagado: boolean
  /** Gramaje de bolsa de ESTA orden — el cliente puede pedir un gramaje distinto al estándar de 350 g. */
  bagSizeGrams: number
  actualFullBags: number
  actualRemainderGrams: number
  packageAllocation: PackageAllocation
  incompletePackageType: PackageType
  status: OrderStatus
  currentStepName: string
  createdAt: string
  updatedAt: string
  finalizedAt: string | null
}

export interface Client {
  id: string
  name: string
  city: string
  phone: string
  createdAt: string
  updatedAt: string
}

export interface ClientWithOrders extends Client {
  orders: Order[]
}

// Indexado por nombre de paso (no por índice) para que el mismo mapeo sirva
// tanto para el flujo pergamino como el natural (que agrega "Limpieza").
const STEP_STATUS_MAP: Record<string, OrderStatus> = {
  'Recepción': 'Recibido',
  'Limpieza': 'En preparación',
  'Trillado': 'En preparación',
  'Tuestes': 'En tueste',
  'Postproceso': 'En molienda',
  'Empaque': 'En empaque',
  'Resumen': 'En empaque',
}

export function statusForCompletedStep(stepName: string): OrderStatus {
  return STEP_STATUS_MAP[stepName] ?? 'Recibido'
}

export function statusProgressFraction(status: OrderStatus): number {
  return (STATUS_ORDER.indexOf(status) + 1) / STATUS_ORDER.length
}
