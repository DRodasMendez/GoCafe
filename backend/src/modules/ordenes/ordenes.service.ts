import { OrderStatus, Prisma, type Orden } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AppError, NotFoundError } from '../../errors'
import { statusForCompletedStep } from '../../utils/orderStatus'
import { formatFolio } from '../../utils/folio'
import * as empaqueService from '../inventario/empaque.service'
import { CLIENT_PACKAGE_TYPES } from '../inventario/empaque.constants'

const ROASTS_ORDER = { orderBy: { seq: 'asc' as const } }

function withOrderNo<T extends { seq: number }>(row: T) {
  return { ...row, orderNo: formatFolio('GC', row.seq) }
}

export async function listOrdenes(filter?: { clienteId?: string }) {
  const rows = await prisma.orden.findMany({
    where: { clienteId: filter?.clienteId },
    include: { roasts: ROASTS_ORDER },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(withOrderNo)
}

export async function getOrden(id: string) {
  const row = await prisma.orden.findUnique({ where: { id }, include: { roasts: ROASTS_ORDER } })
  if (!row) throw new NotFoundError('Orden no encontrada.')
  return withOrderNo(row)
}

interface RoastInput {
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

interface CreateOrdenInput {
  clienteId: string
  receivedDate: string
  estimatedDate: string
  coffeeType: 'pergamino' | 'natural' | 'oro'
  initialWeight: number
  humidity: number
  cleaningWeight?: number
  threshingWeight?: number
  roasts?: RoastInput[]
  finalWeight?: number
  roastType: string
  grindType: string
  totalPrice?: number
  bagSizeGrams?: number
  actualFullBags?: number
  actualRemainderGrams?: number
  packageAllocation: Record<string, number>
  incompletePackageType: Prisma.OrdenCreateInput['incompletePackageType']
  currentStepName: string
}

export async function createOrden(input: CreateOrdenInput) {
  const { roasts, ...rest } = input
  const created = await prisma.orden.create({
    data: {
      cliente: { connect: { id: input.clienteId } },
      receivedDate: new Date(input.receivedDate),
      estimatedDate: new Date(input.estimatedDate),
      coffeeType: input.coffeeType,
      initialWeight: input.initialWeight,
      humidity: input.humidity,
      cleaningWeight: input.cleaningWeight ?? 0,
      threshingWeight: input.threshingWeight ?? 0,
      finalWeight: input.finalWeight ?? 0,
      roastType: input.roastType,
      grindType: input.grindType,
      totalPrice: input.totalPrice ?? 0,
      bagSizeGrams: input.bagSizeGrams ?? 350,
      actualFullBags: input.actualFullBags ?? 0,
      actualRemainderGrams: input.actualRemainderGrams ?? 0,
      packageAllocation: input.packageAllocation,
      incompletePackageType: input.incompletePackageType,
      currentStepName: input.currentStepName,
      status: statusForCompletedStep(input.currentStepName),
      roasts: roasts ? { create: roasts.map((r, i) => ({ seq: i + 1, ...r })) } : undefined,
    },
    include: { roasts: ROASTS_ORDER },
  })
  return withOrderNo(created)
}

interface UpdateOrdenPatch extends Partial<Omit<CreateOrdenInput, 'clienteId'>> {
  pagado?: boolean
}

/** Bloquea la fila de la orden hasta el fin de la transacción, para que una edición y una finalización simultáneas no se pisen. */
async function lockOrden(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM ordenes WHERE id = ${id} FOR UPDATE`)
}

function normalizedAllocation(allocation: unknown): string {
  const entries = Object.entries((allocation as Record<string, number>) ?? {}).filter(([, qty]) => Number(qty) > 0)
  return JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Una orden finalizada ya descontó sus bolsas del inventario de empaque: cambiar después el empaque
 * (bolsas, sobrante, gramaje, distribución) dejaría el inventario descuadrado sin rastro. Se permite
 * corregir el resto (precio, fechas, tuestes, etc.).
 */
function assertEmpaqueSinCambios(existing: Orden, patch: UpdateOrdenPatch) {
  const differs = (a: number, b: number | undefined) => b !== undefined && Math.abs(a - b) > 0.005
  const cambios =
    differs(existing.actualFullBags, patch.actualFullBags) ||
    differs(existing.actualRemainderGrams.toNumber(), patch.actualRemainderGrams) ||
    differs(existing.bagSizeGrams.toNumber(), patch.bagSizeGrams) ||
    (patch.incompletePackageType !== undefined && patch.incompletePackageType !== existing.incompletePackageType) ||
    (patch.packageAllocation !== undefined && normalizedAllocation(patch.packageAllocation) !== normalizedAllocation(existing.packageAllocation))
  if (cambios) {
    throw new AppError('Esta orden ya fue finalizada y sus bolsas ya se descontaron del inventario: no se puede cambiar el empaque.')
  }
}

export async function updateOrden(id: string, patch: UpdateOrdenPatch) {
  const { roasts, receivedDate, estimatedDate, currentStepName, ...rest } = patch

  await prisma.$transaction(async tx => {
    await lockOrden(tx, id)
    const existing = await tx.orden.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Orden no encontrada.')

    const finalizada = existing.status === OrderStatus.Finalizado
    if (finalizada) assertEmpaqueSinCambios(existing, patch)
    const nextStatus = finalizada ? OrderStatus.Finalizado : currentStepName ? statusForCompletedStep(currentStepName) : undefined

    await tx.orden.update({
      where: { id },
      data: {
        ...rest,
        pagadoAt: pagadoAtFor(existing, rest.pagado),
        receivedDate: receivedDate ? new Date(receivedDate) : undefined,
        estimatedDate: estimatedDate ? new Date(estimatedDate) : undefined,
        currentStepName,
        status: nextStatus,
      },
    })

    if (roasts) {
      await tx.ordenTueste.deleteMany({ where: { ordenId: id } })
      await tx.ordenTueste.createMany({ data: roasts.map((r, i) => ({ ordenId: id, seq: i + 1, ...r })) })
    }
  })

  return getOrden(id)
}

/** Al finalizar (y solo aquí) se descuentan del inventario de empaque las bolsas usadas por esta orden, en la misma transacción que marca el estado — igual que producción descuenta materia prima al cerrar un lote. */
export async function finalizeOrden(id: string) {
  await prisma.$transaction(async tx => {
    // Se marca finalizada primero y de forma atómica: si llegan dos "finalizar" a la vez, solo uno lo
    // logra (el otro recibe error) — sin esto, las bolsas se descontaban dos veces. Si algo falla más
    // abajo, la transacción revierte también el cambio de estado.
    const claimed = await tx.orden.updateMany({
      where: { id, status: { not: OrderStatus.Finalizado } },
      data: { status: OrderStatus.Finalizado, finalizedAt: new Date() },
    })
    if (claimed.count === 0) {
      if (!(await tx.orden.findUnique({ where: { id } }))) throw new NotFoundError('Orden no encontrada.')
      throw new AppError('Esta orden ya fue finalizada.')
    }
    const orden = await tx.orden.findUniqueOrThrow({ where: { id } })

    const allocation = (orden.packageAllocation as Record<string, number>) ?? {}
    const distribuidas = Object.values(allocation).reduce((sum, qty) => sum + (Number(qty) || 0), 0)
    if (distribuidas !== orden.actualFullBags) {
      throw new AppError(`Las bolsas distribuidas por tipo (${distribuidas}) deben sumar las ${orden.actualFullBags} bolsas completas de la orden.`)
    }
    const remainder = orden.actualRemainderGrams.toNumber()
    if (remainder >= orden.bagSizeGrams.toNumber()) {
      throw new AppError(`El sobrante (${remainder} g) debe ser menor al gramaje de la bolsa (${orden.bagSizeGrams.toNumber()} g).`)
    }

    const folio = formatFolio('GC', orden.seq)
    for (const type of CLIENT_PACKAGE_TYPES) {
      const qty = (allocation[type] ?? 0) + (remainder > 0 && orden.incompletePackageType === type ? 1 : 0)
      await empaqueService.consumirEmpaque(tx, type, qty, `Orden ${folio}`, { referenciaTipo: 'orden', referenciaId: folio })
    }
  })
  return getOrden(id)
}

/** Fecha de pago a guardar: se fija al marcar pagada (si no lo estaba), se borra al desmarcar y no cambia en otro caso. */
function pagadoAtFor(existing: Orden, pagado: boolean | undefined): Date | null | undefined {
  if (pagado === undefined || pagado === existing.pagado) return undefined
  return pagado ? new Date() : null
}

export async function setOrdenPagado(id: string, pagado: boolean) {
  await prisma.$transaction(async tx => {
    await lockOrden(tx, id)
    const existing = await tx.orden.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Orden no encontrada.')
    await tx.orden.update({ where: { id }, data: { pagado, pagadoAt: pagadoAtFor(existing, pagado) } })
  })
  return getOrden(id)
}

/** Una orden finalizada no se puede eliminar: tiene factura y ya descontó sus bolsas del inventario. */
export async function deleteOrden(id: string) {
  const deleted = await prisma.orden.deleteMany({ where: { id, status: { not: OrderStatus.Finalizado } } })
  if (deleted.count === 0) {
    if (!(await prisma.orden.findUnique({ where: { id } }))) throw new NotFoundError('Orden no encontrada.')
    throw new AppError('No se puede eliminar una orden finalizada: ya tiene factura y sus bolsas ya se descontaron del inventario.')
  }
}
