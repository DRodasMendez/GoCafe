import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../errors'
import { EMPAQUE_LABELS, EMPAQUE_TYPES, type EmpaqueType } from './empaque.constants'

/** Acepta tanto el cliente normal como uno dentro de una transacción (ver ordenes y producción, que descuentan bolsas al finalizar). */
type Db = PrismaClient | Prisma.TransactionClient

async function currentStock(db: Db, tipo: EmpaqueType): Promise<number> {
  const row = await db.inventarioEmpaqueStock.findUnique({ where: { tipo } })
  return row ? row.cantidad : 0
}

/**
 * Igual que currentStock, pero bloquea la fila (SELECT ... FOR UPDATE) hasta que la transacción
 * que la llama termine — mismo motivo que en inventario.service.ts: sin esto, dos finalizaciones
 * concurrentes (una orden y un lote, o dos lotes) podrían leer el mismo saldo de bolsas antes de
 * que ninguna hiciera commit y dejar el conteo en negativo.
 */
async function currentStockForUpdate(db: Db, tipo: EmpaqueType): Promise<number> {
  const rows = await db.$queryRaw<{ cantidad: number }[]>(
    Prisma.sql`SELECT cantidad FROM inventario_empaque_stock WHERE tipo = ${tipo} FOR UPDATE`
  )
  return rows[0] ? rows[0].cantidad : 0
}

async function addMovement(
  db: Db,
  tipo: EmpaqueType,
  movimiento: 'entrada' | 'salida',
  cantidad: number,
  motivo: string,
  opts?: { referenciaTipo?: 'produccion_gourmet' | 'produccion_blend' | 'orden' | 'manual'; referenciaId?: string }
) {
  const saldoResultante = await currentStock(db, tipo)
  await db.inventarioEmpaqueMovimiento.create({
    data: {
      tipoEmpaque: tipo,
      tipo: movimiento,
      cantidad,
      motivo,
      referenciaTipo: opts?.referenciaTipo ?? 'manual',
      referenciaId: opts?.referenciaId,
      saldoResultante,
    },
  })
}

async function applyDelta(db: Db, tipo: EmpaqueType, delta: number) {
  // Restar nunca crea la fila (antes ya se validó la existencia); con upsert, la fila "a insertar" llevaría la cantidad negativa y el CHECK la rechaza.
  if (delta < 0) {
    await db.inventarioEmpaqueStock.update({ where: { tipo }, data: { cantidad: { increment: delta } } })
    return
  }
  await db.inventarioEmpaqueStock.upsert({
    where: { tipo },
    create: { tipo, cantidad: delta },
    update: { cantidad: { increment: delta } },
  })
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function getEmpaqueStockSnapshot() {
  const rows = await prisma.inventarioEmpaqueStock.findMany()
  const byTipo = new Map(rows.map(r => [r.tipo, r]))
  return EMPAQUE_TYPES.map(tipo => {
    const row = byTipo.get(tipo)
    return {
      tipo,
      label: EMPAQUE_LABELS[tipo],
      cantidad: row?.cantidad ?? 0,
      minimo: row?.minimo ?? null,
    }
  })
}

export async function getEmpaqueAlerts() {
  const rows = await prisma.inventarioEmpaqueStock.findMany({ where: { minimo: { not: null } } })
  const alerts: { tipo: EmpaqueType; title: string; message: string }[] = []
  for (const row of rows) {
    const tipo = row.tipo as EmpaqueType
    if (row.minimo != null && row.cantidad < row.minimo) {
      const label = EMPAQUE_LABELS[tipo] ?? tipo
      alerts.push({
        tipo,
        title: `Pocas bolsas de ${label}`,
        message: `Quedan ${row.cantidad} bolsas de ${label}, por debajo del mínimo de ${row.minimo}.`,
      })
    }
  }
  return alerts
}

export function getEmpaqueMovimientos(filter?: { tipo?: EmpaqueType; desde?: Date; hasta?: Date }) {
  return prisma.inventarioEmpaqueMovimiento.findMany({
    where: {
      tipoEmpaque: filter?.tipo,
      fecha: filter?.desde || filter?.hasta ? { gte: filter?.desde, lte: filter?.hasta } : undefined,
    },
    orderBy: { fecha: 'desc' },
  })
}

// ---------------------------------------------------------------------------
// Entradas / salidas manuales (compras y correcciones de captura)
// ---------------------------------------------------------------------------

export async function registrarEntradaEmpaque(tipo: EmpaqueType, cantidad: number, motivo: string) {
  if (cantidad <= 0) throw new AppError('La cantidad debe ser mayor que 0.')
  await prisma.$transaction(async tx => {
    await applyDelta(tx, tipo, cantidad)
    await addMovement(tx, tipo, 'entrada', cantidad, motivo || 'Compra de bolsas')
  })
}

/** Corrección manual (ej. se capturó de más). Queda como un único movimiento de salida — el Kardex sigue siendo de solo-inserción. */
export async function registrarSalidaEmpaque(tipo: EmpaqueType, cantidad: number, motivo: string) {
  if (cantidad <= 0) throw new AppError('La cantidad debe ser mayor que 0.')
  await prisma.$transaction(async tx => {
    const disponible = await currentStockForUpdate(tx, tipo)
    if (disponible < cantidad) {
      throw new AppError(`Solo hay ${disponible} unidades disponibles de ${EMPAQUE_LABELS[tipo]}.`)
    }
    await applyDelta(tx, tipo, -cantidad)
    await addMovement(tx, tipo, 'salida', cantidad, motivo || 'Corrección de captura')
  })
}

export async function updateEmpaqueUmbral(tipo: EmpaqueType, minimo: number) {
  const value = Math.max(0, Math.floor(minimo))
  await prisma.inventarioEmpaqueStock.upsert({
    where: { tipo },
    create: { tipo, cantidad: 0, minimo: value },
    update: { minimo: value },
  })
}

// ---------------------------------------------------------------------------
// Consumo automático al finalizar una orden o un lote de producción
// ---------------------------------------------------------------------------

/** Descuenta bolsas vacías usadas (al finalizar una orden o lote, o al embolsar café suelto). Debe llamarse dentro de una transacción ya abierta. */
export async function consumirEmpaque(
  db: Db,
  tipo: EmpaqueType,
  cantidad: number,
  motivo: string,
  referencia: { referenciaTipo: 'produccion_gourmet' | 'produccion_blend' | 'orden' | 'manual'; referenciaId?: string }
) {
  if (cantidad <= 0) return
  const disponible = await currentStockForUpdate(db, tipo)
  if (disponible < cantidad) {
    throw new AppError(
      `No hay suficientes bolsas de ${EMPAQUE_LABELS[tipo] ?? tipo} en inventario. Disponible: ${disponible}, se necesitan ${cantidad}.`
    )
  }
  await applyDelta(db, tipo, -cantidad)
  await addMovement(db, tipo, 'salida', cantidad, motivo, referencia)
}
