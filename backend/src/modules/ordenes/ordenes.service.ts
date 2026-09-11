import { OrderStatus, type Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { NotFoundError } from '../../errors'
import { statusForCompletedStep } from '../../utils/orderStatus'
import { formatFolio } from '../../utils/folio'

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

export async function updateOrden(id: string, patch: UpdateOrdenPatch) {
  const { roasts, receivedDate, estimatedDate, currentStepName, ...rest } = patch

  await prisma.$transaction(async tx => {
    const existing = await tx.orden.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Orden no encontrada.')

    const nextStatus =
      existing.status === OrderStatus.Finalizado ? OrderStatus.Finalizado : currentStepName ? statusForCompletedStep(currentStepName) : undefined

    await tx.orden.update({
      where: { id },
      data: {
        ...rest,
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

export async function finalizeOrden(id: string) {
  const exists = await prisma.orden.findUnique({ where: { id } })
  if (!exists) throw new NotFoundError('Orden no encontrada.')
  await prisma.orden.update({ where: { id }, data: { status: OrderStatus.Finalizado, finalizedAt: new Date() } })
  return getOrden(id)
}

export async function setOrdenPagado(id: string, pagado: boolean) {
  const exists = await prisma.orden.findUnique({ where: { id } })
  if (!exists) throw new NotFoundError('Orden no encontrada.')
  await prisma.orden.update({ where: { id }, data: { pagado } })
  return getOrden(id)
}

export async function deleteOrden(id: string) {
  const exists = await prisma.orden.findUnique({ where: { id } })
  if (!exists) throw new NotFoundError('Orden no encontrada.')
  await prisma.orden.delete({ where: { id } })
}
