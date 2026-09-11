import { OrderStatus } from '@prisma/client'

// Portado de frontend/src/types/order.ts — indexado por nombre de paso (no por índice)
// para que el mismo mapeo sirva tanto para el flujo pergamino como el natural (que agrega "Limpieza").
const STEP_STATUS_MAP: Record<string, OrderStatus> = {
  Recepción: OrderStatus.Recibido,
  Limpieza: OrderStatus.EnPreparacion,
  Trillado: OrderStatus.EnPreparacion,
  Tuestes: OrderStatus.EnTueste,
  Postproceso: OrderStatus.EnMolienda,
  Empaque: OrderStatus.EnEmpaque,
  Resumen: OrderStatus.EnEmpaque,
}

export function statusForCompletedStep(stepName: string): OrderStatus {
  return STEP_STATUS_MAP[stepName] ?? OrderStatus.Recibido
}
