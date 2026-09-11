import { useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Blend, CheckCircle2, Coffee, Loader2, PackageCheck, Pencil, Warehouse, X, XCircle } from 'lucide-react'
import { RAW_MATERIAL_LABELS, ROAST_TYPES, ROAST_TYPE_LABELS } from '../types/production'
import type { RawMaterialType, RoastType } from '../types/production'
import { bagsToLb, localISODate, todayISODate } from '../utils/production'
import {
  RAW_MATERIALS,
  STOCK_LABELS,
  bagsEquivalent,
  descontarGourmetTerminado,
  descontarGranoCafeteria,
  enviarBlendTerminado,
  getInventoryAlerts,
  registrarEntradaMateriaPrima,
  registrarSalidaMateriaPrima,
  updateThreshold,
  useInventory,
  useMovements,
  type FinishedGourmetType,
  type StockMaterial,
} from '../store/inventoryStore'
import DatePickerField from '../components/DatePickerField'

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const DAY_FORMAT = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'long', year: 'numeric' })

const INVENTORY_TABS = [
  { id: 'materia-prima', label: 'Materia prima', icon: Coffee },
  { id: 'grano-cafeteria', label: 'Café en grano (cafetería)', icon: Coffee },
  { id: 'terminado-gourmet', label: 'Terminado — Gourmet', icon: PackageCheck },
  { id: 'terminado-blend', label: 'Terminado — Blend', icon: Blend },
] as const

type InventoryTab = (typeof INVENTORY_TABS)[number]['id']

export default function InventarioPage() {
  const { stock, thresholds } = useInventory()
  const alerts = useMemo(() => getInventoryAlerts(), [stock, thresholds])
  const [tab, setTab] = useState<InventoryTab>('materia-prima')

  const [entradaMaterial, setEntradaMaterial] = useState<RawMaterialType | null>(null)
  const [editarMaterial, setEditarMaterial] = useState<RawMaterialType | null>(null)
  const [retiroGranoOpen, setRetiroGranoOpen] = useState(false)
  const [salidaTerminado, setSalidaTerminado] = useState<{ kind: 'gourmet', tipo: FinishedGourmetType } | { kind: 'blend' } | null>(null)

  const comercialBags = bagsEquivalent(stock.gourmetComercialLb)
  const especialBags = bagsEquivalent(stock.gourmetEspecialLb)
  const blendBags = bagsEquivalent(stock.blendFinishedLb)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black">Inventario de producción</h2>
        <p className="mt-1 text-sm text-stone-500">Materia prima, café en grano, y producto terminado de Gourmet y Blend.</p>
      </div>

      {alerts.length > 0 ? (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="flex gap-2 text-sm font-medium text-red-700">
              <XCircle className="mt-0.5 shrink-0" size={18} />
              <span><b>{a.title}.</b> {a.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-2 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
          <span>Pergamino, Oro y Natural están por encima del mínimo de 25 lb.</span>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap border-b border-stone-200 p-3">
          {INVENTORY_TABS.map(t => (
            <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} icon={t.icon} label={t.label} />
          ))}
        </div>

        <div className="space-y-4 p-5">
          {tab === 'materia-prima' && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                {RAW_MATERIALS.map(material => (
                  <RawMaterialCard
                    key={material}
                    material={material}
                    stockLb={stock[material]}
                    thresholdLb={thresholds[material]}
                    onEntrada={() => setEntradaMaterial(material)}
                    onEditar={() => setEditarMaterial(material)}
                    onThresholdChange={v => updateThreshold(material, v)}
                  />
                ))}
              </div>
              <MonthlyHistory title="Historial de movimientos — Materia prima" materials={['pergamino', 'oro', 'natural']} />
            </>
          )}

          {tab === 'grano-cafeteria' && (
            <>
              <p className="text-sm text-stone-500">Separado por tipo de tueste.</p>
              <div className="grid gap-4 md:grid-cols-3">
                {ROAST_TYPES.map(tipo => (
                  <div key={tipo} className="card p-5">
                    <div className="flex items-start justify-between">
                      <div><p className="text-sm text-stone-500">Tueste {ROAST_TYPE_LABELS[tipo]}</p><p className="mt-2 text-2xl font-black text-stone-900">{stock.granoCafeteria[tipo].toFixed(2)} lb</p></div>
                      <div className="rounded-xl bg-amber-100 p-3 text-amber-700"><Coffee size={20} /></div>
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-secondary" onClick={() => setRetiroGranoOpen(true)}><ArrowDownCircle size={16} /> Enviar a cafetería</button>
              <MonthlyHistory title="Historial de movimientos — Café en grano" materials={['granoCafeteria_claro', 'granoCafeteria_medio', 'granoCafeteria_oscuro']} />
            </>
          )}

          {tab === 'terminado-gourmet' && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <FinishedStockCard label="Gourmet Comercial" lb={stock.gourmetComercialLb} bags={comercialBags} onSalida={() => setSalidaTerminado({ kind: 'gourmet', tipo: 'gourmetComercial' })} />
                <FinishedStockCard label="Gourmet Especial" lb={stock.gourmetEspecialLb} bags={especialBags} onSalida={() => setSalidaTerminado({ kind: 'gourmet', tipo: 'gourmetEspecial' })} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MonthlyHistory title="Historial — Gourmet Comercial" materials={['gourmetComercial']} />
                <MonthlyHistory title="Historial — Gourmet Especial" materials={['gourmetEspecial']} />
              </div>
            </>
          )}

          {tab === 'terminado-blend' && (
            <>
              <div className="max-w-md">
                <FinishedStockCard label="Blend" icon={Blend} lb={stock.blendFinishedLb} bags={blendBags} onSalida={() => setSalidaTerminado({ kind: 'blend' })} actionLabel="Enviar al mayoreo" />
              </div>
              <MonthlyHistory title="Historial de movimientos — Blend" materials={['blendBolsas']} />
            </>
          )}
        </div>
      </div>

      {entradaMaterial && <EntradaModal material={entradaMaterial} onClose={() => setEntradaMaterial(null)} />}
      {editarMaterial && <EditarStockModal material={editarMaterial} stockLb={stock[editarMaterial]} onClose={() => setEditarMaterial(null)} />}
      {retiroGranoOpen && <RetiroGranoModal onClose={() => setRetiroGranoOpen(false)} />}
      {salidaTerminado && (
        <SalidaTerminadoModal
          target={salidaTerminado}
          availableFullBags={salidaTerminado.kind === 'blend' ? blendBags.fullBags : (salidaTerminado.tipo === 'gourmetComercial' ? comercialBags.fullBags : especialBags.fullBags)}
          onClose={() => setSalidaTerminado(null)}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: typeof Coffee, label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${active ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}`}
    >
      <Icon size={16} /> {label}
    </button>
  )
}

function RawMaterialCard({ material, stockLb, thresholdLb, onEntrada, onEditar, onThresholdChange }: {
  material: RawMaterialType
  stockLb: number
  thresholdLb: number
  onEntrada: () => void
  onEditar: () => void
  onThresholdChange: (v: number) => Promise<void>
}) {
  const [editingThreshold, setEditingThreshold] = useState(false)
  const [thresholdStr, setThresholdStr] = useState(String(thresholdLb))
  const low = stockLb < thresholdLb

  return (
    <div className={`card p-5 ${low ? 'border-red-300' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-stone-500">{RAW_MATERIAL_LABELS[material]}</p>
          <p className={`mt-2 text-3xl font-black ${low ? 'text-red-600' : 'text-stone-900'}`}>{stockLb.toFixed(2)} <span className="text-base font-semibold text-stone-400">lb</span></p>
        </div>
        <div className={`rounded-xl p-3 ${low ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}><Coffee size={20} /></div>
      </div>

      {editingThreshold ? (
        <div className="mt-3 flex items-center gap-2">
          <input type="number" min="0" step="1" className="input" value={thresholdStr} onChange={e => setThresholdStr(e.target.value)} />
          <button
            className="btn-secondary shrink-0 !px-3"
            onClick={async () => {
              try {
                await onThresholdChange(Number(thresholdStr) || 0)
                setEditingThreshold(false)
              } catch (err) {
                window.alert(err instanceof Error ? err.message : 'No se pudo actualizar el mínimo.')
              }
            }}
          >
            Guardar
          </button>
        </div>
      ) : (
        <button className="mt-3 flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700" onClick={() => setEditingThreshold(true)}>
          Mínimo: {thresholdLb.toFixed(2)} lb
        </button>
      )}

      <button className="btn-primary mt-4 w-full" onClick={onEntrada}><ArrowUpCircle size={16} /> Registrar entrada</button>
      <button
        className="mt-2 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={stockLb <= 0}
        onClick={onEditar}
      >
        <Pencil size={12} /> Editar (restar una cantidad)
      </button>
    </div>
  )
}

function FinishedStockCard({ label, lb, bags, onSalida, icon: Icon = PackageCheck, actionLabel = 'Enviar a cafetería' }: { label: string, lb: number, bags: { fullBags: number, remainderGrams: number }, onSalida: () => void, icon?: typeof PackageCheck, actionLabel?: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-stone-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-stone-900">{lb.toFixed(2)} lb <span className="text-stone-400">-</span> {bags.fullBags} bolsas</p>
          <p className="mt-1 text-xs text-stone-500">sobrante acumulado: {bags.remainderGrams.toFixed(1)} g</p>
        </div>
        <div className="rounded-xl bg-amber-100 p-3 text-amber-700"><Icon size={20} /></div>
      </div>
      <button className="btn-secondary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-40" disabled={bags.fullBags <= 0} onClick={onSalida}><ArrowDownCircle size={16} /> {actionLabel}</button>
    </div>
  )
}

function MonthlyHistory({ title, materials }: { title: string, materials: StockMaterial[] }) {
  const allMovements = useMovements()
  const [materialFiltro, setMaterialFiltro] = useState<StockMaterial | 'all'>('all')
  const [dia, setDia] = useState(todayISODate())
  const [verTodo, setVerTodo] = useState(false)

  const relevant = useMemo(() => allMovements.filter(m => materials.includes(m.material)), [allMovements, materials])
  const hasMaterialFilter = materials.length > 1

  const shown = useMemo(() => {
    let rows = relevant
    if (hasMaterialFilter && materialFiltro !== 'all') rows = rows.filter(m => m.material === materialFiltro)
    if (!verTodo) rows = rows.filter(m => localISODate(new Date(m.fecha)) === dia)
    return rows
  }, [relevant, hasMaterialFilter, materialFiltro, verTodo, dia])

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4">
        <h4 className="font-black">{title}</h4>
        <div className="flex flex-wrap items-center gap-2">
          {hasMaterialFilter && (
            <div className="w-40"><select className="select !py-2 text-sm" value={materialFiltro} onChange={e => setMaterialFiltro(e.target.value as StockMaterial | 'all')}>
              <option value="all">Todos</option>
              {materials.map(m => <option key={m} value={m}>{STOCK_LABELS[m]}</option>)}
            </select></div>
          )}
          {!verTodo && <div className="w-40"><DatePickerField value={dia} onChange={setDia} /></div>}
          {!hasMaterialFilter && (
            <button type="button" className="text-xs font-semibold text-amber-700 hover:underline" onClick={() => setVerTodo(v => !v)}>
              {verTodo ? 'Ver por día' : 'Ver todo el historial'}
            </button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="flex min-h-32 flex-col items-center justify-center p-6 text-center">
          <Warehouse size={22} className="mb-2 text-stone-300" />
          <p className="text-sm text-stone-500">{verTodo ? 'Sin movimientos registrados.' : `Sin movimientos el ${DAY_FORMAT.format(new Date(dia + 'T00:00:00'))}.`}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                <th className="px-4 pb-2 pt-4">Fecha</th>
                {materials.length > 1 && <th className="px-4 pb-2 pt-4">Material</th>}
                <th className="px-4 pb-2 pt-4">Movimiento</th>
                <th className="px-4 pb-2 pt-4">Cantidad</th>
                <th className="px-4 pb-2 pt-4">Motivo</th>
                <th className="px-4 pb-2 pt-4">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {shown.map(m => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-stone-500">{DATE_TIME_FORMAT.format(new Date(m.fecha))}</td>
                  {materials.length > 1 && <td className="px-4 py-2.5 font-medium text-stone-900">{STOCK_LABELS[m.material]}</td>}
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${m.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {m.tipo === 'entrada' ? <ArrowUpCircle size={13} /> : <ArrowDownCircle size={13} />} {m.tipo === 'entrada' ? 'Entrada' : 'Salida'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{m.cantidad.toFixed(2)} lb</td>
                  <td className="px-4 py-2.5 text-stone-500">{m.motivo}</td>
                  <td className="px-4 py-2.5 font-semibold text-stone-900">{m.saldoResultante.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string, onClose: () => void, children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black">{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function EntradaModal({ material, onClose }: { material: RawMaterialType, onClose: () => void }) {
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const cantidadLb = Number(cantidad) || 0
    if (cantidadLb <= 0) { setError('Ingresa una cantidad mayor que 0.'); return }
    setSubmitting(true)
    try {
      await registrarEntradaMateriaPrima(material, cantidadLb, motivo)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la entrada.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title={`Entrada de ${RAW_MATERIAL_LABELS[material]}`} onClose={onClose}>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
      <form onSubmit={handleSubmit}>
        <label className="block"><span className="label">Cantidad (lb)</span><input type="number" min="0" step="0.01" autoFocus className="input" value={cantidad} onChange={e => { setError(''); setCantidad(e.target.value) }} /></label>
        <label className="mt-4 block"><span className="label">Motivo (opcional)</span><input className="input" placeholder="Compra a proveedor..." value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
        <button type="submit" className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting}>
          {submitting && <Loader2 size={16} className="animate-spin" />} Registrar entrada
        </button>
      </form>
    </Modal>
  )
}

function EditarStockModal({ material, stockLb, onClose }: { material: RawMaterialType, stockLb: number, onClose: () => void }) {
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const cantidadLb = Number(cantidad) || 0
    if (cantidadLb <= 0) { setError('Ingresa una cantidad mayor que 0.'); return }
    if (cantidadLb > stockLb) { setError(`Solo hay ${stockLb.toFixed(2)} lb disponibles.`); return }
    setSubmitting(true)
    try {
      await registrarSalidaMateriaPrima(material, cantidadLb, motivo.trim() || 'Corrección de captura')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la corrección.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title={`Editar stock de ${RAW_MATERIAL_LABELS[material]}`} onClose={onClose}>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
      <p className="mb-4 text-sm text-stone-500">Stock actual: <b className="text-stone-700">{stockLb.toFixed(2)} lb</b>. Usa esto cuando se capturó de más en una entrada — ingresa cuánto restar (el exceso), no el total correcto.</p>
      <form onSubmit={handleSubmit}>
        <label className="block"><span className="label">Cantidad a restar (lb)</span><input type="number" min="0" max={stockLb} step="0.01" autoFocus className="input" value={cantidad} onChange={e => { setError(''); setCantidad(e.target.value) }} /></label>
        <label className="mt-4 block"><span className="label">Motivo (opcional)</span><input className="input" placeholder="Corrección de captura" value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
        <button type="submit" className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting}>
          {submitting && <Loader2 size={16} className="animate-spin" />} Restar del inventario
        </button>
      </form>
    </Modal>
  )
}

function RetiroGranoModal({ onClose }: { onClose: () => void }) {
  const [tipo, setTipo] = useState<RoastType>('medio')
  const [cantidad, setCantidad] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const cantidadLb = Number(cantidad) || 0
    if (cantidadLb <= 0) { setError('Ingresa una cantidad mayor que 0.'); return }
    setSubmitting(true)
    try {
      await descontarGranoCafeteria(tipo, cantidadLb, `Envío a cafetería — Tueste ${ROAST_TYPE_LABELS[tipo]}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el envío.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Envío de café en grano a cafetería" onClose={onClose}>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
      <form onSubmit={handleSubmit}>
        <label className="block"><span className="label">Tipo de tueste</span>
          <select className="select" value={tipo} onChange={e => setTipo(e.target.value as RoastType)}>
            {ROAST_TYPES.map(t => <option key={t} value={t}>{ROAST_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="mt-4 block"><span className="label">Cantidad (lb)</span><input type="number" min="0" step="0.01" autoFocus className="input" value={cantidad} onChange={e => { setError(''); setCantidad(e.target.value) }} /></label>
        <button type="submit" className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting}>
          {submitting && <Loader2 size={16} className="animate-spin" />} Registrar envío
        </button>
      </form>
    </Modal>
  )
}

type SalidaTarget = { kind: 'gourmet', tipo: FinishedGourmetType } | { kind: 'blend' }

const NOTA_MAX_LENGTH = 140

function SalidaTerminadoModal({ target, availableFullBags, onClose }: { target: SalidaTarget, availableFullBags: number, onClose: () => void }) {
  const [bolsas, setBolsas] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const title = target.kind === 'blend' ? 'Enviar bolsas de Blend al mayoreo' : `Enviar Gourmet ${target.tipo === 'gourmetComercial' ? 'Comercial' : 'Especial'} a cafetería`
  const motivoBase = target.kind === 'blend' ? 'Envío al mayoreo' : 'Envío a cafetería'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const bolsasNum = Math.max(0, Math.floor(Number(bolsas) || 0))
    if (bolsasNum <= 0) { setError('Ingresa una cantidad de bolsas mayor que 0.'); return }
    if (bolsasNum > availableFullBags) { setError(`Solo hay ${availableFullBags} bolsas completas disponibles.`); return }
    const motivo = nota.trim() ? `${motivoBase} — ${nota.trim()}` : motivoBase
    setSubmitting(true)
    try {
      if (target.kind === 'blend') {
        await enviarBlendTerminado(bolsasNum, motivo)
      } else {
        await descontarGourmetTerminado(target.tipo, bagsToLb(bolsasNum), motivo)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el envío.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
      <p className="mb-3 text-sm text-stone-500">Bolsas completas disponibles: <b className="text-stone-700">{availableFullBags}</b></p>
      <form onSubmit={handleSubmit}>
        <label className="block"><span className="label">Bolsas a enviar</span><input type="number" min="0" max={availableFullBags} step="1" autoFocus className="input" value={bolsas} onChange={e => { setError(''); setBolsas(e.target.value) }} /></label>
        <label className="mt-4 block">
          <span className="label">Nota (opcional)</span>
          <input className="input" maxLength={NOTA_MAX_LENGTH} placeholder="" value={nota} onChange={e => setNota(e.target.value)} />
          <span className="mt-1 block text-right text-xs text-stone-400">{nota.length}/{NOTA_MAX_LENGTH}</span>
        </label>
        <button type="submit" className="btn-primary mt-1 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting}>
          {submitting && <Loader2 size={16} className="animate-spin" />} Registrar envío
        </button>
      </form>
    </Modal>
  )
}
