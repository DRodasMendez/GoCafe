import { useEffect, useSyncExternalStore } from 'react'
import { BAG_GRAMS, LB_TO_GRAMS } from '../utils/production'
import type { RawMaterialType, RoastType } from '../types/production'
import { apiFetch } from '../api/client'

export type FinishedGourmetType = 'gourmetComercial' | 'gourmetEspecial'
export type StockMaterial =
  | RawMaterialType
  | 'granoCafeteria_claro' | 'granoCafeteria_medio' | 'granoCafeteria_oscuro'
  | FinishedGourmetType
  | 'blendBolsas'

export const STOCK_LABELS: Record<StockMaterial, string> = {
  pergamino: 'Pergamino',
  oro: 'Oro',
  natural: 'Natural',
  granoCafeteria_claro: 'Café en grano — Tueste Claro',
  granoCafeteria_medio: 'Café en grano — Tueste Medio',
  granoCafeteria_oscuro: 'Café en grano — Tueste Oscuro',
  gourmetComercial: 'Gourmet Comercial',
  gourmetEspecial: 'Gourmet Especial',
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
  gourmet_comercial: 'gourmetComercial',
  gourmet_especial: 'gourmetEspecial',
  blend_bolsas: 'blendBolsas',
}

interface Stock {
  pergamino: number
  oro: number
  natural: number
  granoCafeteria: Record<RoastType, number>
  gourmetComercialLb: number
  gourmetEspecialLb: number
  blendFinishedLb: number
}

interface Thresholds {
  pergamino: number
  oro: number
  natural: number
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
    stock: { pergamino: 0, oro: 0, natural: 0, granoCafeteria: { claro: 0, medio: 0, oscuro: 0 }, gourmetComercialLb: 0, gourmetEspecialLb: 0, blendFinishedLb: 0 },
    thresholds: { pergamino: 25, oro: 25, natural: 25 },
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
      case 'gourmet_comercial': s.stock.gourmetComercialLb = cantidad; break
      case 'gourmet_especial': s.stock.gourmetEspecialLb = cantidad; break
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

type Listener = () => void
const listeners = new Set<Listener>()

let state: InventoryState = emptyState()
let movements: InventoryMovement[] = []
let loaded = false
let loadingPromise: Promise<void> | null = null

function notify() {
  listeners.forEach(l => l())
}

async function refresh(): Promise<void> {
  const [stockRows, movRows] = await Promise.all([
    apiFetch<StockDto[]>('/api/inventario/stock'),
    apiFetch<MovimientoDto[]>('/api/inventario/movimientos'),
  ])
  state = buildState(stockRows)
  movements = movRows.map(fromMovementDto)
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

// ---------------------------------------------------------------------------
// Producto terminado: Gourmet (Comercial / Especial)
// ---------------------------------------------------------------------------

export async function descontarGourmetTerminado(tipo: FinishedGourmetType, cantidadLb: number, motivo: string): Promise<void> {
  const backendTipo = tipo === 'gourmetComercial' ? 'comercial' : 'especial'
  await apiFetch<void>(`/api/inventario/gourmet/${backendTipo}/salida`, { method: 'POST', body: { cantidadLb, motivo } })
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
// Mínimos y alertas (solo materia prima: Pergamino, Oro, Natural)
// ---------------------------------------------------------------------------

export type AlertSeverity = 'critico'

export interface InventoryAlert {
  material: RawMaterialType
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
      const label = material.charAt(0).toUpperCase() + material.slice(1)
      alerts.push({
        material,
        severity: 'critico',
        title: `Pocas existencias de ${label}`,
        message: `Quedan ${current.toFixed(2)} lb de ${label}, por debajo del mínimo de ${min.toFixed(2)} lb.`,
      })
    }
  }
  return alerts
}

export function bagsEquivalent(lb: number) {
  const grams = lb * LB_TO_GRAMS
  const fullBags = Math.floor(grams / BAG_GRAMS)
  const remainderGrams = grams - fullBags * BAG_GRAMS
  return { fullBags, remainderGrams }
}
