import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AppError, NotFoundError } from '../../errors'
import { blendRequiredRawMaterial } from '../../utils/productionMath'
import { packagedWeightLb } from '../../utils/production'
import * as inventarioService from '../inventario/inventario.service'
import * as empaqueService from '../inventario/empaque.service'
import { granoMaterial } from '../inventario/inventario.constants'
import type { ProductionPackageType } from '../inventario/empaque.constants'
import { formatFolio } from '../../utils/folio'

const ROASTS_ORDER = { orderBy: { seq: 'asc' } } as const

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function listGourmetProductions() {
  const rows = await prisma.produccionGourmet.findMany({ include: { roasts: ROASTS_ORDER }, orderBy: { createdAt: 'desc' } })
  return rows.map(withGourmetCode)
}

export async function listBlendProductions() {
  const rows = await prisma.produccionBlend.findMany({ include: { roasts: ROASTS_ORDER }, orderBy: { createdAt: 'desc' } })
  return rows.map(withBlendCode)
}

export async function getGourmetProduction(id: string) {
  const row = await prisma.produccionGourmet.findUnique({ where: { id }, include: { roasts: ROASTS_ORDER } })
  if (!row) throw new NotFoundError('Producción Gourmet no encontrada.')
  return withGourmetCode(row)
}

export async function getBlendProduction(id: string) {
  const row = await prisma.produccionBlend.findUnique({ where: { id }, include: { roasts: ROASTS_ORDER } })
  if (!row) throw new NotFoundError('Producción Blend no encontrada.')
  return withBlendCode(row)
}

function withGourmetCode<T extends { seq: number }>(row: T) {
  return { ...row, code: formatFolio('GG', row.seq) }
}

function withBlendCode<T extends { seq: number }>(row: T) {
  return { ...row, code: formatFolio('GB', row.seq) }
}

// ---------------------------------------------------------------------------
// Gourmet — el inventario solo se mueve al finalizar (igual que la versión local)
// ---------------------------------------------------------------------------

export async function startGourmetProduction(input: { fecha: string; pergaminoUsedLb: number; notas: string }) {
  if (input.pergaminoUsedLb <= 0) throw new AppError('Ingresa una cantidad de Pergamino mayor que 0.')
  const available = await inventarioService.getRawMaterialStock('pergamino')
  if (available < input.pergaminoUsedLb) {
    throw new AppError(`No hay suficiente Pergamino en inventario. Disponible: ${available.toFixed(2)} lb, se necesitan ${input.pergaminoUsedLb.toFixed(2)} lb.`)
  }

  const created = await prisma.produccionGourmet.create({
    data: {
      fecha: new Date(input.fecha),
      pergaminoUsedLb: input.pergaminoUsedLb,
      currentStepName: 'Trillado',
      notas: input.notas,
    },
    include: { roasts: ROASTS_ORDER },
  })
  return withGourmetCode(created)
}

interface GourmetPatch {
  fecha?: string
  currentStepName?: string
  trilladoWeightLb?: number
  roastType?: 'claro' | 'medio' | 'oscuro'
  roasts?: { weightLb: number; notes: string }[]
  pesoTuesteResultLb?: number
  reservaCafeteriaLb?: number
  molidoWeightLb?: number
  actualFullBags?: number
  actualRemainderGrams?: number
  comercialBags?: number
  especialBags?: number
  notas?: string
}

export async function updateGourmetProduction(id: string, patch: GourmetPatch) {
  const { roasts, fecha, ...rest } = patch
  await prisma.$transaction(async tx => {
    const exists = await tx.produccionGourmet.findUnique({ where: { id } })
    if (!exists) throw new NotFoundError('Producción Gourmet no encontrada.')

    await tx.produccionGourmet.update({ where: { id }, data: { ...rest, fecha: fecha ? new Date(fecha) : undefined } })

    if (roasts) {
      await tx.produccionGourmetTueste.deleteMany({ where: { produccionId: id } })
      await tx.produccionGourmetTueste.createMany({
        data: roasts.map((r, i) => ({ produccionId: id, seq: i + 1, weightLb: r.weightLb, notes: r.notes })),
      })
    }
  })
  return getGourmetProduction(id)
}

/** Cierra el lote: aquí (y solo aquí) se descuenta el Pergamino y se suman la reserva y el empaque al inventario, todo en una sola transacción. */
export async function finalizeGourmetProduction(id: string) {
  await prisma.$transaction(async tx => {
    const p = await tx.produccionGourmet.findUnique({ where: { id } })
    if (!p) throw new NotFoundError('Producción Gourmet no encontrada.')
    if (p.status === 'terminada') throw new AppError('Este lote ya fue finalizado.')

    const pergaminoUsedLb = p.pergaminoUsedLb.toNumber()
    const available = await inventarioService.getRawMaterialStock('pergamino', tx)
    if (available < pergaminoUsedLb) {
      throw new AppError(`No hay suficiente Pergamino para finalizar este lote. Disponible: ${available.toFixed(2)} lb, se necesitan ${pergaminoUsedLb.toFixed(2)} lb.`)
    }

    const code = formatFolio('GG', p.seq)
    await inventarioService.consumirMateriaPrima(tx, 'pergamino', pergaminoUsedLb, `Producción Gourmet ${code}`, {
      referenciaTipo: 'produccion_gourmet',
      referenciaId: code,
    })

    const reservaCafeteriaLb = p.reservaCafeteriaLb.toNumber()
    if (reservaCafeteriaLb > 0) {
      await inventarioService.agregarGranoCafeteria(
        tx,
        granoMaterial(p.roastType),
        reservaCafeteriaLb,
        `Reserva de Producción Gourmet ${code} (Tueste ${p.roastType})`,
        { referenciaTipo: 'produccion_gourmet', referenciaId: code }
      )
    }

    if (p.comercialBags + p.especialBags !== p.actualFullBags) {
      throw new AppError(
        `Las bolsas Comercial (${p.comercialBags}) + Especial (${p.especialBags}) deben sumar las ${p.actualFullBags} bolsas completas del lote.`
      )
    }
    const packagedLb = packagedWeightLb(p.actualFullBags, p.actualRemainderGrams.toNumber())
    await inventarioService.agregarGourmetTerminado(tx, packagedLb, { comercial: p.comercialBags, especial: p.especialBags }, code)

    // Bolsas físicas (inventario de empaque) usadas para envasar lo anterior — independiente del peso.
    await empaqueService.consumirEmpaque(tx, 'comercial', p.comercialBags, `Producción Gourmet ${code}`, {
      referenciaTipo: 'produccion_gourmet',
      referenciaId: code,
    })
    await empaqueService.consumirEmpaque(tx, 'especial', p.especialBags, `Producción Gourmet ${code}`, {
      referenciaTipo: 'produccion_gourmet',
      referenciaId: code,
    })

    await tx.produccionGourmet.update({
      where: { id },
      data: { status: 'terminada', currentStepName: 'Resumen', finalizedAt: new Date() },
    })
  })
  return getGourmetProduction(id)
}

/** Un lote finalizado no se puede eliminar: sus movimientos de inventario ya se aplicaron y no hay forma segura de revertirlos. */
export async function deleteGourmetProduction(id: string) {
  const p = await prisma.produccionGourmet.findUnique({ where: { id } })
  if (!p) throw new NotFoundError('Producción Gourmet no encontrada.')
  if (p.status === 'terminada') throw new AppError('No se puede eliminar un lote finalizado: los movimientos de inventario ya se aplicaron.')
  await prisma.produccionGourmet.delete({ where: { id } })
}

// ---------------------------------------------------------------------------
// Blend — mismo principio: el inventario se mueve solo al finalizar
// ---------------------------------------------------------------------------

export async function validateBlendPlan(cantidadLb: number, segundaType: 'oro' | 'natural') {
  const { pergaminoLb, segundaLb } = blendRequiredRawMaterial(cantidadLb)
  const pergaminoAvailable = await inventarioService.getRawMaterialStock('pergamino')
  const segundaAvailable = await inventarioService.getRawMaterialStock(segundaType)
  const pergaminoFaltante = Math.max(pergaminoLb - pergaminoAvailable, 0)
  const segundaFaltante = Math.max(segundaLb - segundaAvailable, 0)
  return {
    pergaminoLb,
    segundaLb,
    pergaminoAvailable,
    segundaAvailable,
    pergaminoFaltante,
    segundaFaltante,
    isValid: pergaminoFaltante === 0 && segundaFaltante === 0 && cantidadLb > 0,
  }
}

export async function startBlendProduction(input: { fecha: string; cantidadPlanificadaLb: number; segundaType: 'oro' | 'natural'; notas: string }) {
  const plan = await validateBlendPlan(input.cantidadPlanificadaLb, input.segundaType)
  if (!plan.isValid) {
    throw new AppError(`Inventario insuficiente. Faltan ${plan.pergaminoFaltante.toFixed(2)} lb de Pergamino y ${plan.segundaFaltante.toFixed(2)} lb de ${input.segundaType}.`)
  }

  const created = await prisma.produccionBlend.create({
    data: {
      fecha: new Date(input.fecha),
      cantidadPlanificadaLb: input.cantidadPlanificadaLb,
      segundaType: input.segundaType,
      pergaminoUsedLb: plan.pergaminoLb,
      segundaUsedLb: plan.segundaLb,
      currentStepName: 'Trillado',
      notas: input.notas,
    },
    include: { roasts: ROASTS_ORDER },
  })
  return withBlendCode(created)
}

interface BlendPatch {
  fecha?: string
  currentStepName?: string
  trilladoWeightLb?: number
  roasts?: { weightLb: number; notes: string }[]
  pesoTuesteResultLb?: number
  molidoMezclaWeightLb?: number
  actualFullBags?: number
  actualRemainderGrams?: number
  bagType?: ProductionPackageType
  notas?: string
}

export async function updateBlendProduction(id: string, patch: BlendPatch) {
  const { roasts, fecha, ...rest } = patch
  await prisma.$transaction(async tx => {
    const exists = await tx.produccionBlend.findUnique({ where: { id } })
    if (!exists) throw new NotFoundError('Producción Blend no encontrada.')

    await tx.produccionBlend.update({ where: { id }, data: { ...rest, fecha: fecha ? new Date(fecha) : undefined } })

    if (roasts) {
      await tx.produccionBlendTueste.deleteMany({ where: { produccionId: id } })
      await tx.produccionBlendTueste.createMany({
        data: roasts.map((r, i) => ({ produccionId: id, seq: i + 1, weightLb: r.weightLb, notes: r.notes })),
      })
    }
  })
  return getBlendProduction(id)
}

export async function finalizeBlendProduction(id: string) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const p = await tx.produccionBlend.findUnique({ where: { id } })
    if (!p) throw new NotFoundError('Producción Blend no encontrada.')
    if (p.status === 'terminada') throw new AppError('Este lote ya fue finalizado.')

    const pergaminoUsedLb = p.pergaminoUsedLb.toNumber()
    const segundaUsedLb = p.segundaUsedLb.toNumber()
    const pergaminoAvailable = await inventarioService.getRawMaterialStock('pergamino', tx)
    const segundaAvailable = await inventarioService.getRawMaterialStock(p.segundaType, tx)
    const missing: string[] = []
    if (pergaminoAvailable < pergaminoUsedLb) missing.push(`${(pergaminoUsedLb - pergaminoAvailable).toFixed(2)} lb de Pergamino`)
    if (segundaAvailable < segundaUsedLb) missing.push(`${(segundaUsedLb - segundaAvailable).toFixed(2)} lb de ${p.segundaType}`)
    if (missing.length > 0) throw new AppError(`No hay suficiente inventario para finalizar este lote. Falta ${missing.join(' y ')}.`)

    const code = formatFolio('GB', p.seq)
    // Ambos descuentos y el ingreso de producto terminado quedan en la misma transacción:
    // si algo falla a la mitad, Postgres revierte todo — no puede quedar un descuento aplicado a medias.
    await inventarioService.consumirMateriaPrima(tx, 'pergamino', pergaminoUsedLb, `Producción Blend ${code}`, {
      referenciaTipo: 'produccion_blend',
      referenciaId: code,
    })
    await inventarioService.consumirMateriaPrima(tx, p.segundaType, segundaUsedLb, `Producción Blend ${code}`, {
      referenciaTipo: 'produccion_blend',
      referenciaId: code,
    })
    const packagedLb = packagedWeightLb(p.actualFullBags, p.actualRemainderGrams.toNumber())
    await inventarioService.agregarBlendTerminado(tx, packagedLb, code)

    // Bolsas físicas (inventario de empaque) usadas para envasar las actualFullBags de este lote.
    await empaqueService.consumirEmpaque(tx, p.bagType as ProductionPackageType, p.actualFullBags, `Producción Blend ${code}`, {
      referenciaTipo: 'produccion_blend',
      referenciaId: code,
    })

    await tx.produccionBlend.update({
      where: { id },
      data: { status: 'terminada', currentStepName: 'Resumen', finalizedAt: new Date() },
    })
  })
  return getBlendProduction(id)
}

export async function deleteBlendProduction(id: string) {
  const p = await prisma.produccionBlend.findUnique({ where: { id } })
  if (!p) throw new NotFoundError('Producción Blend no encontrada.')
  if (p.status === 'terminada') throw new AppError('No se puede eliminar un lote finalizado: los movimientos de inventario ya se aplicaron.')
  await prisma.produccionBlend.delete({ where: { id } })
}
