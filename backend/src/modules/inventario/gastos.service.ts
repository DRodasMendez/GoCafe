import { prisma } from '../../lib/prisma'
import { STOCK_LABELS, type StockMaterial } from './inventario.constants'
import { EMPAQUE_LABELS, type EmpaqueType } from './empaque.constants'

export interface GastoItem {
  categoria: 'materia_prima' | 'empaque'
  clave: string
  label: string
  unidad: 'lb' | 'bolsas'
  /** Cantidad total que entró (con y sin costo registrado). */
  cantidad: number
  /** Cantidad de las entradas que sí tienen costo: base para el precio promedio. */
  cantidadConCosto: number
  costoTotal: number
  /** Costo por libra o por bolsa, promediado sobre las entradas con costo. Null si ninguna tiene costo. */
  precioPromedio: number | null
  entradas: number
  entradasSinCosto: number
}

interface Fila { clave: string, cantidad: number, costo: number | null }

function agrupar(filas: Fila[], categoria: GastoItem['categoria'], label: (clave: string) => string, unidad: GastoItem['unidad']): GastoItem[] {
  const porClave = new Map<string, GastoItem>()
  for (const f of filas) {
    const item = porClave.get(f.clave) ?? {
      categoria, clave: f.clave, label: label(f.clave), unidad,
      cantidad: 0, cantidadConCosto: 0, costoTotal: 0, precioPromedio: null, entradas: 0, entradasSinCosto: 0,
    }
    item.entradas += 1
    item.cantidad += f.cantidad
    if (f.costo === null) {
      item.entradasSinCosto += 1
    } else {
      item.costoTotal += f.costo
      item.cantidadConCosto += f.cantidad
    }
    porClave.set(f.clave, item)
  }
  return [...porClave.values()].map(i => ({
    ...i,
    costoTotal: Math.round(i.costoTotal * 100) / 100,
    precioPromedio: i.cantidadConCosto > 0 ? Math.round((i.costoTotal / i.cantidadConCosto) * 100) / 100 : null,
  }))
}

/**
 * Gastos de un periodo: compras (entradas manuales) de materia prima y de bolsas, con su costo.
 * Las entradas que vienen de finalizar un lote no son compras y no cuentan aquí.
 */
export async function getGastos(desde: Date, hasta: Date) {
  const rango = { gte: desde, lt: hasta }
  const [materia, empaque] = await Promise.all([
    prisma.inventarioMovimiento.findMany({
      where: { tipo: 'entrada', referenciaTipo: 'manual', fecha: rango },
      select: { material: true, cantidadLb: true, costoTotal: true },
    }),
    prisma.inventarioEmpaqueMovimiento.findMany({
      where: { tipo: 'entrada', referenciaTipo: 'manual', fecha: rango },
      select: { tipoEmpaque: true, cantidad: true, costoTotal: true },
    }),
  ])

  const items = [
    ...agrupar(
      materia.map(m => ({ clave: m.material, cantidad: m.cantidadLb.toNumber(), costo: m.costoTotal?.toNumber() ?? null })),
      'materia_prima',
      clave => STOCK_LABELS[clave as StockMaterial] ?? clave,
      'lb'
    ),
    ...agrupar(
      empaque.map(e => ({ clave: e.tipoEmpaque, cantidad: e.cantidad, costo: e.costoTotal?.toNumber() ?? null })),
      'empaque',
      clave => EMPAQUE_LABELS[clave as EmpaqueType] ?? clave,
      'bolsas'
    ),
  ].sort((a, b) => b.costoTotal - a.costoTotal)

  const sum = (cat?: GastoItem['categoria']) =>
    Math.round(items.filter(i => !cat || i.categoria === cat).reduce((s, i) => s + i.costoTotal, 0) * 100) / 100

  return {
    items,
    totalMateriaPrima: sum('materia_prima'),
    totalEmpaque: sum('empaque'),
    total: sum(),
    entradasSinCosto: items.reduce((s, i) => s + i.entradasSinCosto, 0),
  }
}
