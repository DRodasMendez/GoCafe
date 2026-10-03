import { useEffect, useSyncExternalStore } from 'react'
import { BAG_GRAMS, LB_TO_GRAMS } from '../utils/production'
import type { RawMaterialType, RoastType } from '../types/production'
import { apiFetch } from '../api/client'

export type StockMaterial =
  | RawMaterialType
  | 'granoCafeteria_claro' | 'granoCafeteria_medio' | 'granoCafeteria_oscuro'
  | 'gourmet'
  | 'blendBolsas'

export const STOCK_LABELS: Record<StockMaterial, string> = {
  pergamino: 'Pergamino',
  oro: 'Oro',
  natural: 'Natural',
  granoCafeteria_claro: 'Café en grano — Tueste Claro',
  granoCafeteria_medio: 'Café en grano — Tueste Medio',
  granoCafeteria_oscuro: 'Café en grano — Tueste Oscuro',
  // Comercial y Especial no son productos distintos — es el mismo café, la diferencia es solo la bolsa (ver inventario de empaque).
  gourmet: 'Gourmet (terminado)',
  blendBolsas: 'Blend (bolsas de 350 g)',
}

export const RAW_MATERIALS: RawMaterialType[] = ['pergamino', 'oro', 'natural']

// El backend usa snake_case para los materiales que no son materia prima — se traduce en ambos sentidos.
const BACKEND_TO_FRONTEND_MATERIAL: Record<string, StockMaterial> = {
  pergamino: 'pergamino',
  oro: 'oro',
  natural: 'natural',
  grano_claro: 'granoCafeteria_claro',
  grano_medio: 'granoCafeteria_medio',
  grano_oscuro: 'granoCafeteria_oscuro',
  gourmet: 'gourmet',
  blend_bolsas: 'blendBolsas',
}

interface Stock {
  pergamino: number
  oro: number
  natural: number
  granoCafeteria: Record<RoastType, number>
  gourmetLb: number
  blendFinishedLb: number
}

interface Thresholds {
  pergamino: number
  oro: number
  natural: number
  /** Un solo mínimo para el total de café en grano (los tres tuestes sumados). */
  granoCafeteria: number
}

interface InventoryState {
  stock: Stock
  thresholds: Thresholds
}

export type MovementKind = 'entrada' | 'salida'

export interface InventoryMovement {
  id: string
  fecha: string
  material: StockMaterial
  tipo: MovementKind
  cantidad: number
  motivo: string
  referenciaId?: string
  saldoResultante: number
}

function emptyState(): InventoryState {
  return {
    stock: { pergamino: 0, oro: 0, natural: 0, granoCafeteria: { claro: 0, medio: 0, oscuro: 0 }, gourmetLb: 0, blendFinishedLb: 0 },
    thresholds: { pergamino: 25, oro: 25, natural: 25, granoCafeteria: 5 },
  }
}

interface StockDto {
  material: string
  label: string
  cantidadLb: number
  minimoLb: number | null
}

interface MovimientoDto {
  id: string
  fecha: string
  material: string
  tipo: MovementKind
  cantidadLb: string
  motivo: string
  referenciaId: string | null
  saldoResultante: string
}

function buildState(rows: StockDto[]): InventoryState {
  const s = emptyState()
  for (const row of rows) {
    const cantidad = Number(row.cantidadLb)
    switch (row.material) {
      case 'pergamino': s.stock.pergamino = cantidad; if (row.minimoLb != null) s.thresholds.pergamino = Number(row.minimoLb); break
      case 'oro': s.stock.oro = cantidad; if (row.minimoLb != null) s.thresholds.oro = Number(row.minimoLb); break
      case 'natural': s.stock.natural = cantidad; if (row.minimoLb != null) s.thresholds.natural = Number(row.minimoLb); break
      case 'grano_claro': s.stock.granoCafeteria.claro = cantidad; break
      case 'grano_medio': s.stock.granoCafeteria.medio = cantidad; break
      case 'grano_oscuro': s.stock.granoCafeteria.oscuro = cantidad; break
      case 'gourmet': s.stock.gourmetLb = cantidad; break
      case 'blend_bolsas': s.stock.blendFinishedLb = cantidad; break
    }
  }
  return s
}

function fromMovementDto(m: MovimientoDto): InventoryMovement {
  return {
    id: m.id,
    fecha: m.fecha,
    material: BACKEND_TO_FRONTEND_MATERIAL[m.material] ?? (m.material as StockMaterial),
    tipo: m.tipo,
    cantidad: Number(m.cantidadLb),
    motivo: m.motivo,
    referenciaId: m.referenciaId ?? undefined,
    saldoResultante: Number(m.saldoResultante),
  }
}

// ---------------------------------------------------------------------------
// Empaque (bolsas físicas): 6 tipos de Clientes + "comercial"/"especial" de Producción propia.
// Unidades, no libras — por eso vive separado del Stock/InventoryMovement de arriba.
// ---------------------------------------------------------------------------

export interface EmpaqueStockItem {
  tipo: string
  label: string
  cantidad: number
  minimo: number | null
}

export interface EmpaqueMovement {
  id: string
  fecha: string
  tipoEmpaque: string
  tipo: MovementKind
  cantidad: number
  motivo: string
  referenciaId?: string
  saldoResultante: number
}

interface EmpaqueMovimientoDto {
  id: string
  fecha: string
  tipoEmpaque: string
  tipo: MovementKind
  cantidad: number
  motivo: string
  referenciaId: string | null
  saldoResultante: number
}

function fromEmpaqueMovementDto(m: EmpaqueMovimientoDto): EmpaqueMovement {
  return {
    id: m.id,
    fecha: m.fecha,
    tipoEmpaque: m.tipoEmpaque,
    tipo: m.tipo,
    cantidad: m.cantidad,
    motivo: m.motivo,
    referenciaId: m.referenciaId ?? undefined,
    saldoResultante: m.saldoResultante,
  }
}

type Listener = () => void
const listeners = new Set<Listener>()

let state: InventoryState = emptyState()
let movements: InventoryMovement[] = []
let empaqueStock: EmpaqueStockItem[] = []
let empaqueMovements: EmpaqueMovement[] = []
let gourmetEmpacado: GourmetEmpacado = { comercial: 0, especial: 0, sueltoGramos: 0 }
let loaded = false
let loadingPromise: Promise<void> | null = null

function notify() {
  listeners.forEach(l => l())
}

async function refresh(): Promise<void> {
  const [stockRows, movRows, empaqueStockRows, empaqueMovRows, empacadoRow, granoUmbral] = await Promise.all([
    apiFetch<StockDto[]>('/api/inventario/stock'),
    apiFetch<MovimientoDto[]>('/api/inventario/movimientos'),
    apiFetch<EmpaqueStockItem[]>('/api/inventario/empaque/stock'),
    apiFetch<EmpaqueMovimientoDto[]>('/api/inventario/empaque/movimientos'),
    apiFetch<GourmetEmpacado>('/api/inventario/gourmet/empacado'),
    apiFetch<{ minimoLb: number }>('/api/inventario/grano-cafeteria/umbral'),
  ])
  state = buildState(stockRows)
  state.thresholds.granoCafeteria = granoUmbral.minimoLb
  movements = movRows.map(fromMovementDto)
  empaqueStock = empaqueStockRows
  empaqueMovements = empaqueMovRows.map(fromEmpaqueMovementDto)
  gourmetEmpacado = empacadoRow
  notify()
}

export function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot() {
  return state
}

export function getMovementsSnapshot() {
  return movements
}

export function isInventoryLoaded() {
  return loaded
}

export function ensureInventoryLoaded(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (!loadingPromise) {
    loadingPromise = refresh()
      .then(() => { loaded = true })
      .catch(err => {
        loadingPromise = null
        throw err
      })
  }
  return loadingPromise
}

/**
 * Fuerza un refetch del inventario ya cargado. Hace falta porque otros stores (producción) mueven
 * el inventario del lado del backend al finalizar un lote, pero este caché no se entera solo —
 * sin esto, había que recargar la página entera para ver el inventario actualizado.
 */
export async function refreshInventory(): Promise<void> {
  await refresh()
  loaded = true
}

export function useInventory(): InventoryState {
  useEffect(() => { ensureInventoryLoaded().catch(() => {}) }, [])
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function useInventoryLoaded(): boolean {
  useEffect(() => { ensureInventoryLoaded().catch(() => {}) }, [])
  return useSyncExternalStore(subscribe, isInventoryLoaded)
}

export function useMovements(): InventoryMovement[] {
  useEffect(() => { ensureInventoryLoaded().catch(() => {}) }, [])
  return useSyncExternalStore(subscribe, getMovementsSnapshot)
}

export function getEmpaqueStockSnapshot() {
  return empaqueStock
}

export function getEmpaqueMovementsSnapshot() {
  return empaqueMovements
}

export function useEmpaqueStock(): EmpaqueStockItem[] {
  useEffect(() => { ensureInventoryLoaded().catch(() => {}) }, [])
  return useSyncExternalStore(subscribe, getEmpaqueStockSnapshot)
}

export function useEmpaqueMovements(): EmpaqueMovement[] {
  useEffect(() => { ensureInventoryLoaded().catch(() => {}) }, [])
  return useSyncExternalStore(subscribe, getEmpaqueMovementsSnapshot)
}

export function getRawMaterialStock(material: RawMaterialType): number {
  return state.stock[material]
}

// ---------------------------------------------------------------------------
// Materia prima
// ---------------------------------------------------------------------------

export async function registrarEntradaMateriaPrima(material: RawMaterialType, cantidadLb: number, motivo: string): Promise<void> {
  await apiFetch<void>(`/api/inventario/materia-prima/${material}/entrada`, { method: 'POST', body: { cantidadLb, motivo } })
  await refresh()
}

/** Resta stock de materia prima por una corrección manual (ej. se capturó de más). Queda como un único movimiento de salida en el Kardex, con su motivo — nunca se reescribe la entrada original. */
export async function registrarSalidaMateriaPrima(material: RawMaterialType, cantidadLb: number, motivo: string): Promise<void> {
  await apiFetch<void>(`/api/inventario/materia-prima/${material}/salida`, { method: 'POST', body: { cantidadLb, motivo } })
  await refresh()
}

export async function updateThreshold(material: RawMaterialType, value: number): Promise<void> {
  await apiFetch<void>(`/api/inventario/materia-prima/${material}/umbral`, { method: 'PATCH', body: { minimoLb: Math.max(0, value) } })
  await refresh()
}

// ---------------------------------------------------------------------------
// Café en grano reservado para cafeterías
// ---------------------------------------------------------------------------

export async function descontarGranoCafeteria(tipo: RoastType, cantidadLb: number, motivo: string): Promise<void> {
  await apiFetch<void>(`/api/inventario/grano-cafeteria/${tipo}/salida`, { method: 'POST', body: { cantidadLb, motivo } })
  await refresh()
}

/** Mínimo sobre el total de café en grano (los tres tuestes sumados). */
export async function updateGranoThreshold(value: number): Promise<void> {
  await apiFetch<void>(`/api/inventario/grano-cafeteria/umbral`, { method: 'PATCH', body: { minimoLb: Math.max(0, value) } })
  await refresh()
}

export function granoTotalLb(stock: Stock): number {
  return stock.granoCafeteria.claro + stock.granoCafeteria.medio + stock.granoCafeteria.oscuro
}

// ---------------------------------------------------------------------------
// Producto terminado: Gourmet. Un solo café, embolsado durante la producción en bolsas Comercial
// o Especial: se cuentan las bolsas llenas por tipo, y lo que no se embolsó es café suelto.
// ---------------------------------------------------------------------------

export type GourmetBagType = 'comercial' | 'especial'

export interface GourmetEmpacado {
  comercial: number
  especial: number
  sueltoGramos: number
}

export function getGourmetEmpacadoSnapshot() {
  return gourmetEmpacado
}

export function useGourmetEmpacado(): GourmetEmpacado {
  useEffect(() => { ensureInventoryLoaded().catch(() => {}) }, [])
  return useSyncExternalStore(subscribe, getGourmetEmpacadoSnapshot)
}

export async function descontarGourmetTerminado(tipoBolsa: GourmetBagType, bolsas: number, motivo: string): Promise<void> {
  await apiFetch<void>(`/api/inventario/gourmet/salida`, { method: 'POST', body: { tipoBolsa, bolsas, motivo } })
  await refresh()
}

/** Cuando en bodega juntan el café suelto de varios lotes y llenan bolsas. */
export async function empacarSobranteGourmet(tipoBolsa: GourmetBagType, bolsas: number, motivo: string): Promise<void> {
  await apiFetch<void>(`/api/inventario/gourmet/empacar-sobrante`, { method: 'POST', body: { tipoBolsa, bolsas, motivo } })
  await refresh()
}

// ---------------------------------------------------------------------------
// Producto terminado: Blend (bolsas de 350 g)
// ---------------------------------------------------------------------------

export async function enviarBlendTerminado(bolsas: number, motivo: string): Promise<void> {
  await apiFetch<void>(`/api/inventario/blend/salida`, { method: 'POST', body: { bolsas, motivo } })
  await refresh()
}

// ---------------------------------------------------------------------------
// Mínimos y alertas: materia prima (Pergamino, Oro, Natural) y café en grano de cafetería
// ---------------------------------------------------------------------------

export type AlertSeverity = 'critico'

export interface InventoryAlert {
  material: RawMaterialType | 'granoCafeteria'
  severity: AlertSeverity
  title: string
  message: string
}

export function getInventoryAlerts(): InventoryAlert[] {
  const alerts: InventoryAlert[] = []
  for (const material of RAW_MATERIALS) {
    const current = state.stock[material]
    const min = state.thresholds[material]
    if (current < min) {
      const label = STOCK_LABELS[material]
      alerts.push({
        material,
        severity: 'critico',
        title: `Pocas existencias de ${label}`,
        message: `Quedan ${current.toFixed(2)} lb de ${label}, por debajo del mínimo de ${min.toFixed(2)} lb.`,
      })
    }
  }
  // Café en grano: una sola alerta sobre el total de los tres tuestes, no una por tueste.
  const grano = granoTotalLb(state.stock)
  if (grano < state.thresholds.granoCafeteria) {
    alerts.push({
      material: 'granoCafeteria',
      severity: 'critico',
      title: 'Poco café en grano para cafetería',
      message: `Quedan ${grano.toFixed(2)} lb de café en grano (todos los tuestes), por debajo del mínimo de ${state.thresholds.granoCafeteria.toFixed(2)} lb.`,
    })
  }
  return alerts
}

export function bagsEquivalent(lb: number) {
  const grams = lb * LB_TO_GRAMS
  const fullBags = Math.floor(grams / BAG_GRAMS)
  const remainderGrams = grams - fullBags * BAG_GRAMS
  return { fullBags, remainderGrams }
}

// ---------------------------------------------------------------------------
// Empaque (bolsas físicas): entradas/salidas manuales (compras y correcciones) y umbrales
// ---------------------------------------------------------------------------

export async function registrarEntradaEmpaque(tipo: string, cantidad: number, motivo: string): Promise<void> {
  await apiFetch<void>(`/api/inventario/empaque/${encodeURIComponent(tipo)}/entrada`, { method: 'POST', body: { cantidad, motivo } })
  await refresh()
}

/** Corrección manual (ej. se capturó de más). Queda como un único movimiento de salida — nunca se reescribe la entrada original. */
export async function registrarSalidaEmpaque(tipo: string, cantidad: number, motivo: string): Promise<void> {
  await apiFetch<void>(`/api/inventario/empaque/${encodeURIComponent(tipo)}/salida`, { method: 'POST', body: { cantidad, motivo } })
  await refresh()
}

export async function updateEmpaqueUmbral(tipo: string, minimo: number): Promise<void> {
  await apiFetch<void>(`/api/inventario/empaque/${encodeURIComponent(tipo)}/umbral`, { method: 'PATCH', body: { minimo: Math.max(0, Math.floor(minimo)) } })
  await refresh()
}

export interface EmpaqueAlert {
  tipo: string
  title: string
  message: string
}

export function getEmpaqueAlerts(): EmpaqueAlert[] {
  const alerts: EmpaqueAlert[] = []
  for (const item of empaqueStock) {
    if (item.minimo != null && item.cantidad < item.minimo) {
      alerts.push({
        tipo: item.tipo,
        title: `Pocas bolsas de ${item.label}`,
        message: `Quedan ${item.cantidad} bolsas de ${item.label}, por debajo del mínimo de ${item.minimo}.`,
      })
    }
  }
  return alerts
}
