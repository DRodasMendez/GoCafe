import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../errors'
import { bagsEquivalent, bagsToLb } from '../../utils/production'
import { ALL_MATERIALS, RAW_MATERIALS, STOCK_LABELS, type RawMaterialType, type StockMaterial } from './inventario.constants'

/** Acepta tanto el cliente normal como uno dentro de una transacción, para poder componer varios movimientos como una sola operación atómica (ver inventario y producción). */
type Db = PrismaClient | Prisma.TransactionClient

function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : value.toNumber()
}

async function currentStock(db: Db, material: StockMaterial): Promise<number> {
  const row = await db.inventarioStock.findUnique({ where: { material } })
  return row ? toNumber(row.cantidadLb) : 0
}

/**
 * Igual que currentStock, pero bloquea la fila (SELECT ... FOR UPDATE) hasta que la transacción
 * que la llama termine. Úsalo justo antes de validar-y-restar existencias: sin este candado, dos
 * finalizaciones concurrentes podrían leer el mismo saldo antes de que ninguna hiciera commit y
 * dejar el inventario en negativo. Solo tiene efecto real dentro de un prisma.$transaction — todos
 * los call sites de abajo ya pasan `tx`.
 */
async function currentStockForUpdate(db: Db, material: StockMaterial): Promise<number> {
  const rows = await db.$queryRaw<{ cantidad_lb: Prisma.Decimal }[]>(
    Prisma.sql`SELECT cantidad_lb FROM inventario_stock WHERE material = ${material} FOR UPDATE`
  )
  return rows[0] ? toNumber(rows[0].cantidad_lb) : 0
}

async function addMovement(
  db: Db,
  material: StockMaterial,
  tipo: 'entrada' | 'salida',
  cantidadLb: number,
  motivo: string,
  opts?: { referenciaTipo?: 'produccion_gourmet' | 'produccion_blend' | 'manual'; referenciaId?: string }
) {
  const saldoResultante = await currentStock(db, material)
  await db.inventarioMovimiento.create({
    data: {
      material,
      tipo,
      cantidadLb,
      motivo,
      referenciaTipo: opts?.referenciaTipo ?? 'manual',
      referenciaId: opts?.referenciaId,
      saldoResultante,
    },
  })
}

async function applyDelta(db: Db, material: StockMaterial, deltaLb: number) {
  await db.inventarioStock.upsert({
    where: { material },
    create: { material, cantidadLb: deltaLb },
    update: { cantidadLb: { increment: deltaLb } },
  })
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function getStockSnapshot() {
  const rows = await prisma.inventarioStock.findMany()
  const byMaterial = new Map(rows.map(r => [r.material, r]))
  return ALL_MATERIALS.map(material => {
    const row = byMaterial.get(material)
    return {
      material,
      label: STOCK_LABELS[material],
      cantidadLb: row ? toNumber(row.cantidadLb) : 0,
      minimoLb: row?.minimoLb ? toNumber(row.minimoLb) : null,
    }
  })
}

export async function getRawMaterialStock(material: RawMaterialType, db: Db = prisma): Promise<number> {
  return currentStock(db, material)
}

export async function getInventoryAlerts() {
  const rows = await prisma.inventarioStock.findMany({ where: { material: { in: [...RAW_MATERIALS] } } })
  const alerts: { material: RawMaterialType; title: string; message: string }[] = []
  for (const material of RAW_MATERIALS) {
    const row = rows.find(r => r.material === material)
    const current = row ? toNumber(row.cantidadLb) : 0
    const min = row?.minimoLb ? toNumber(row.minimoLb) : 0
    if (current < min) {
      const label = STOCK_LABELS[material]
      alerts.push({
        material,
        title: `Pocas existencias de ${label}`,
        message: `Quedan ${current.toFixed(2)} lb de ${label}, por debajo del mínimo de ${min.toFixed(2)} lb.`,
      })
    }
  }
  return alerts
}

export function getMovimientos(filter?: { material?: StockMaterial; desde?: Date; hasta?: Date }) {
  return prisma.inventarioMovimiento.findMany({
    where: {
      material: filter?.material,
      fecha: filter?.desde || filter?.hasta ? { gte: filter?.desde, lte: filter?.hasta } : undefined,
    },
    orderBy: { fecha: 'desc' },
  })
}

// ---------------------------------------------------------------------------
// Materia prima
// ---------------------------------------------------------------------------

export async function registrarEntradaMateriaPrima(material: RawMaterialType, cantidadLb: number, motivo: string) {
  if (cantidadLb <= 0) throw new AppError('La cantidad debe ser mayor que 0.')
  await prisma.$transaction(async tx => {
    await applyDelta(tx, material, cantidadLb)
    await addMovement(tx, material, 'entrada', cantidadLb, motivo || 'Compra de materia prima')
  })
}

/** Descuenta materia prima usada en una producción. Se puede llamar dentro de una transacción ya abierta (ver produccion.service). */
export async function consumirMateriaPrima(
  db: Db,
  material: RawMaterialType,
  cantidadLb: number,
  motivo: string,
  referencia: { referenciaTipo: 'produccion_gourmet' | 'produccion_blend'; referenciaId: string }
) {
  if (cantidadLb <= 0) return
  const disponible = await currentStockForUpdate(db, material)
  if (disponible < cantidadLb) {
    throw new AppError(
      `No hay suficiente ${STOCK_LABELS[material]} en inventario. Disponible: ${disponible.toFixed(2)} lb, se necesitan ${cantidadLb.toFixed(2)} lb.`
    )
  }
  await applyDelta(db, material, -cantidadLb)
  await addMovement(db, material, 'salida', cantidadLb, motivo, referencia)
}

/**
 * Resta materia prima del inventario por una corrección manual (ej. se capturó de más en la última
 * entrada). Queda como un único movimiento de salida con su motivo — el Kardex sigue siendo de
 * solo-inserción (nunca se reescribe ni se borra una fila pasada), solo que la corrección ahora es
 * una salida más, no una reversión + una entrada nueva.
 */
export async function registrarSalidaMateriaPrima(material: RawMaterialType, cantidadLb: number, motivo: string) {
  if (cantidadLb <= 0) throw new AppError('La cantidad debe ser mayor que 0.')
  await prisma.$transaction(async tx => {
    const disponible = await currentStockForUpdate(tx, material)
    if (disponible < cantidadLb) {
      throw new AppError(`No hay suficiente ${STOCK_LABELS[material]} en inventario. Disponible: ${disponible.toFixed(2)} lb.`)
    }
    await applyDelta(tx, material, -cantidadLb)
    await addMovement(tx, material, 'salida', cantidadLb, motivo || 'Corrección de captura')
  })
}

export async function updateUmbral(material: RawMaterialType, minimoLb: number) {
  await prisma.inventarioStock.upsert({
    where: { material },
    create: { material, cantidadLb: 0, minimoLb: Math.max(0, minimoLb) },
    update: { minimoLb: Math.max(0, minimoLb) },
  })
}

// ---------------------------------------------------------------------------
// Café en grano reservado para cafeterías
// ---------------------------------------------------------------------------

export async function agregarGranoCafeteria(
  db: Db,
  tipo: StockMaterial,
  cantidadLb: number,
  motivo: string,
  referencia: { referenciaTipo: 'produccion_gourmet'; referenciaId: string }
) {
  if (cantidadLb <= 0) return
  await applyDelta(db, tipo, cantidadLb)
  await addMovement(db, tipo, 'entrada', cantidadLb, motivo, referencia)
}

export async function descontarGranoCafeteria(tipo: StockMaterial, cantidadLb: number, motivo: string) {
  if (cantidadLb <= 0) throw new AppError('La cantidad debe ser mayor que 0.')
  await prisma.$transaction(async tx => {
    const disponible = await currentStockForUpdate(tx, tipo)
    if (disponible < cantidadLb) {
      throw new AppError(`Solo hay ${disponible.toFixed(2)} lb disponibles de ${STOCK_LABELS[tipo]}.`)
    }
    await applyDelta(tx, tipo, -cantidadLb)
    await addMovement(tx, tipo, 'salida', cantidadLb, motivo)
  })
}

// ---------------------------------------------------------------------------
// Producto terminado: Gourmet
// ---------------------------------------------------------------------------

export async function agregarGourmetTerminado(db: Db, comercialLb: number, especialLb: number, code: string) {
  if (comercialLb > 0) {
    await applyDelta(db, 'gourmet_comercial', comercialLb)
    await addMovement(db, 'gourmet_comercial', 'entrada', comercialLb, 'Producción Gourmet finalizada', {
      referenciaTipo: 'produccion_gourmet',
      referenciaId: code,
    })
  }
  if (especialLb > 0) {
    await applyDelta(db, 'gourmet_especial', especialLb)
    await addMovement(db, 'gourmet_especial', 'entrada', especialLb, 'Producción Gourmet finalizada', {
      referenciaTipo: 'produccion_gourmet',
      referenciaId: code,
    })
  }
}

export async function descontarGourmetTerminado(tipo: 'gourmet_comercial' | 'gourmet_especial', cantidadLb: number, motivo: string) {
  if (cantidadLb <= 0) throw new AppError('La cantidad debe ser mayor que 0.')
  await prisma.$transaction(async tx => {
    const disponible = await currentStockForUpdate(tx, tipo)
    if (disponible < cantidadLb) {
      throw new AppError(`Solo hay ${disponible.toFixed(2)} lb disponibles de ${STOCK_LABELS[tipo]}.`)
    }
    await applyDelta(tx, tipo, -cantidadLb)
    await addMovement(tx, tipo, 'salida', cantidadLb, motivo)
  })
}

// ---------------------------------------------------------------------------
// Producto terminado: Blend
// ---------------------------------------------------------------------------

export async function agregarBlendTerminado(db: Db, packagedLb: number, code: string) {
  if (packagedLb <= 0) return
  await applyDelta(db, 'blend_bolsas', packagedLb)
  await addMovement(db, 'blend_bolsas', 'entrada', packagedLb, 'Producción Blend finalizada', {
    referenciaTipo: 'produccion_blend',
    referenciaId: code,
  })
}

export async function enviarBlendTerminado(bolsas: number, motivo: string) {
  if (bolsas <= 0) throw new AppError('Ingresa una cantidad de bolsas mayor que 0.')
  await prisma.$transaction(async tx => {
    const disponibleLb = await currentStockForUpdate(tx, 'blend_bolsas')
    const disponibles = bagsEquivalent(disponibleLb).fullBags
    if (bolsas > disponibles) throw new AppError(`Solo hay ${disponibles} bolsas de Blend disponibles.`)
    const lb = bagsToLb(bolsas)
    await applyDelta(tx, 'blend_bolsas', -lb)
    await addMovement(tx, 'blend_bolsas', 'salida', lb, motivo)
  })
}
