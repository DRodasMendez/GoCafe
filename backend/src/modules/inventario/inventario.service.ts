import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../errors'
import { BAG_GRAMS, LB_TO_GRAMS, bagsEquivalent, bagsToLb } from '../../utils/production'
import {
  ALL_MATERIALS,
  GRANO_MATERIALS,
  GRANO_MINIMO_CLAVE,
  GRANO_MINIMO_DEFAULT_LB,
  RAW_MATERIALS,
  STOCK_LABELS,
  type RawMaterialType,
  type StockMaterial,
} from './inventario.constants'
import { consumirEmpaque } from './empaque.service'

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
  // Restar nunca crea la fila (antes ya se validó que hay existencia). No se usa upsert para restar:
  // la fila "a insertar" del upsert llevaría la cantidad negativa y la restricción CHECK la rechaza.
  if (deltaLb < 0) {
    await db.inventarioStock.update({ where: { material }, data: { cantidadLb: { increment: deltaLb } } })
    return
  }
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
  const rows = await prisma.inventarioStock.findMany({ where: { material: { in: [...RAW_MATERIALS, ...GRANO_MATERIALS] } } })
  const cantidad = (material: string) => {
    const row = rows.find(r => r.material === material)
    return row ? toNumber(row.cantidadLb) : 0
  }
  const alerts: { material: RawMaterialType | 'grano_cafeteria'; title: string; message: string }[] = []

  for (const material of RAW_MATERIALS) {
    const row = rows.find(r => r.material === material)
    const current = cantidad(material)
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

  // Café en grano: una sola alerta sobre el total de los tres tuestes, no una por tueste.
  const granoTotal = GRANO_MATERIALS.reduce((sum, m) => sum + cantidad(m), 0)
  const granoMin = await getGranoMinimo()
  if (granoTotal < granoMin) {
    alerts.push({
      material: 'grano_cafeteria',
      title: 'Poco café en grano para cafetería',
      message: `Quedan ${granoTotal.toFixed(2)} lb de café en grano (todos los tuestes), por debajo del mínimo de ${granoMin.toFixed(2)} lb.`,
    })
  }
  return alerts
}

export async function getGranoMinimo(): Promise<number> {
  const row = await prisma.configuracion.findUnique({ where: { clave: GRANO_MINIMO_CLAVE } })
  return row ? toNumber(row.valor) : GRANO_MINIMO_DEFAULT_LB
}

export async function updateGranoMinimo(minimoLb: number) {
  const valor = Math.max(0, minimoLb)
  await prisma.configuracion.upsert({
    where: { clave: GRANO_MINIMO_CLAVE },
    create: { clave: GRANO_MINIMO_CLAVE, valor },
    update: { valor },
  })
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
// Producto terminado: Gourmet. Es un solo café; lo que cambia es la bolsa en la que se llenó
// durante la producción. El stock "gourmet" en libras es el total (bolsas llenas + café suelto);
// inventario_gourmet_empacado lleva cuántas bolsas llenas hay de cada tipo.
// ---------------------------------------------------------------------------

export const GOURMET_BAG_TYPES = ['comercial', 'especial'] as const
export type GourmetBagType = (typeof GOURMET_BAG_TYPES)[number]
const GOURMET_BAG_LABELS: Record<GourmetBagType, string> = { comercial: 'Comercial', especial: 'Especial' }

/** Tolerancia por el redondeo a 2 decimales de las libras guardadas (0.005 lb ≈ 2.3 g). */
const SUELTO_TOLERANCIA_G = 3

async function addEmpacado(db: Db, tipo: GourmetBagType, delta: number) {
  if (delta < 0) {
    await db.inventarioGourmetEmpacado.update({ where: { tipoBolsa: tipo }, data: { bolsas: { increment: delta } } })
    return
  }
  await db.inventarioGourmetEmpacado.upsert({
    where: { tipoBolsa: tipo },
    create: { tipoBolsa: tipo, bolsas: delta },
    update: { bolsas: { increment: delta } },
  })
}

async function empacadoSnapshot(db: Db, forUpdate: boolean) {
  const rows = forUpdate
    ? await db.$queryRaw<{ tipo_bolsa: string; bolsas: number }[]>(
        Prisma.sql`SELECT tipo_bolsa, bolsas FROM inventario_gourmet_empacado FOR UPDATE`
      )
    : (await db.inventarioGourmetEmpacado.findMany()).map(r => ({ tipo_bolsa: r.tipoBolsa, bolsas: r.bolsas }))
  const by = new Map(rows.map(r => [r.tipo_bolsa, r.bolsas]))
  return { comercial: by.get('comercial') ?? 0, especial: by.get('especial') ?? 0 }
}

function sueltoGramos(totalLb: number, bolsasLlenas: number): number {
  return Math.max(0, Math.round((totalLb * LB_TO_GRAMS - bolsasLlenas * BAG_GRAMS) * 10) / 10)
}

export async function getGourmetEmpacado() {
  const [bolsas, totalLb] = await Promise.all([empacadoSnapshot(prisma, false), currentStock(prisma, 'gourmet')])
  return { ...bolsas, sueltoGramos: sueltoGramos(totalLb, bolsas.comercial + bolsas.especial) }
}

/** Al finalizar un lote: suma el peso total al stock y las bolsas llenas a su tipo. Lo que no se embolsó queda como café suelto. */
export async function agregarGourmetTerminado(db: Db, cantidadLb: number, bolsas: Record<GourmetBagType, number>, code: string) {
  if (cantidadLb > 0) {
    await applyDelta(db, 'gourmet', cantidadLb)
    await addMovement(db, 'gourmet', 'entrada', cantidadLb, `Producción Gourmet finalizada (${bolsas.comercial} Comercial + ${bolsas.especial} Especial)`, {
      referenciaTipo: 'produccion_gourmet',
      referenciaId: code,
    })
  }
  for (const tipo of GOURMET_BAG_TYPES) {
    if (bolsas[tipo] > 0) await addEmpacado(db, tipo, bolsas[tipo])
  }
}

export async function descontarGourmetTerminado(tipo: GourmetBagType, bolsas: number, motivo: string) {
  if (bolsas <= 0) throw new AppError('Ingresa una cantidad de bolsas mayor que 0.')
  await prisma.$transaction(async tx => {
    // Mismo orden de bloqueo en todas las operaciones de Gourmet (stock en lb, luego bolsas) para no provocar deadlocks.
    const stockLb = await currentStockForUpdate(tx, 'gourmet')
    const empacado = await empacadoSnapshot(tx, true)
    if (bolsas > empacado[tipo]) {
      throw new AppError(`Solo hay ${empacado[tipo]} bolsas ${GOURMET_BAG_LABELS[tipo]} llenas disponibles.`)
    }
    const lb = Math.min(bagsToLb(bolsas), stockLb)
    await addEmpacado(tx, tipo, -bolsas)
    await applyDelta(tx, 'gourmet', -lb)
    await addMovement(tx, 'gourmet', 'salida', lb, `${motivo} (${bolsas} bolsas ${GOURMET_BAG_LABELS[tipo]})`)
  })
}

/** Cuando en bodega juntan el café suelto (sobrante de varios lotes) y llenan bolsas: pasan de suelto a bolsa llena, y se descuenta la bolsa vacía. El total en libras no cambia. */
export async function empacarSobranteGourmet(tipo: GourmetBagType, bolsas: number, motivo: string) {
  if (bolsas <= 0) throw new AppError('Ingresa una cantidad de bolsas mayor que 0.')
  await prisma.$transaction(async tx => {
    const stockLb = await currentStockForUpdate(tx, 'gourmet')
    const empacado = await empacadoSnapshot(tx, true)
    const suelto = sueltoGramos(stockLb, empacado.comercial + empacado.especial)
    const alcanza = Math.floor((suelto + SUELTO_TOLERANCIA_G) / BAG_GRAMS)
    if (bolsas > alcanza) {
      throw new AppError(`Solo hay ${suelto.toFixed(1)} g de café suelto: alcanza para ${alcanza} bolsa${alcanza === 1 ? '' : 's'} de ${BAG_GRAMS} g.`)
    }
    await addEmpacado(tx, tipo, bolsas)
    await consumirEmpaque(tx, tipo, bolsas, motivo || 'Empaque de café suelto (sobrante de lotes)', { referenciaTipo: 'manual' })
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
