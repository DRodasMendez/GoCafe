import { useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Blend, CheckCircle2, Coffee, Loader2, Package, PackageCheck, Pencil, Warehouse, X, XCircle } from 'lucide-react'
import { RAW_MATERIAL_LABELS, ROAST_TYPES, ROAST_TYPE_LABELS } from '../types/production'
import type { RawMaterialType, RoastType } from '../types/production'
import { PACKAGE_TYPES } from '../types/order'
import { BAG_GRAMS, localISODate, todayISODate } from '../utils/production'
import {
  RAW_MATERIALS,
  STOCK_LABELS,
  bagsEquivalent,
  descontarGourmetTerminado,
  descontarGranoCafeteria,
  empacarSobranteGourmet,
  enviarBlendTerminado,
  getEmpaqueAlerts,
  getInventoryAlerts,
  granoTotalLb,
  registrarEntradaEmpaque,
  registrarEntradaMateriaPrima,
  registrarSalidaEmpaque,
  registrarSalidaMateriaPrima,
  updateEmpaqueUmbral,
  updateGranoThreshold,
  updateThreshold,
  useEmpaqueMovements,
  useEmpaqueStock,
  useGourmetEmpacado,
  useInventory,
  useMovements,
  type EmpaqueStockItem,
  type GourmetBagType,
  type GourmetEmpacado,
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
  { id: 'empaque', label: 'Empaque (bolsas)', icon: Package },
] as const

type InventoryTab = (typeof INVENTORY_TABS)[number]['id']

export default function InventarioPage() {
  const { stock, thresholds } = useInventory()
  const empaqueStock = useEmpaqueStock()
  const alerts = useMemo(() => getInventoryAlerts(), [stock, thresholds])
  const empaqueAlerts = useMemo(() => getEmpaqueAlerts(), [empaqueStock])
  const [tab, setTab] = useState<InventoryTab>('materia-prima')

  const [entradaMaterial, setEntradaMaterial] = useState<RawMaterialType | null>(null)
  const [editarMaterial, setEditarMaterial] = useState<RawMaterialType | null>(null)
  const [retiroGranoOpen, setRetiroGranoOpen] = useState(false)
  const gourmetEmpacado = useGourmetEmpacado()
  const [blendSalidaOpen, setBlendSalidaOpen] = useState(false)
  const [gourmetSalidaOpen, setGourmetSalidaOpen] = useState(false)
  const [empacarSobranteOpen, setEmpacarSobranteOpen] = useState(false)
  const [entradaEmpaque, setEntradaEmpaque] = useState<EmpaqueStockItem | null>(null)
  const [editarEmpaque, setEditarEmpaque] = useState<EmpaqueStockItem | null>(null)

  const blendBags = bagsEquivalent(stock.blendFinishedLb)
  const sueltoAlcanzaPara = Math.floor((gourmetEmpacado.sueltoGramos + 3) / BAG_GRAMS)

  const empaqueClientes = empaqueStock.filter(e => (PACKAGE_TYPES as readonly string[]).includes(e.tipo))
  const empaqueProduccion = empaqueStock.filter(e => !(PACKAGE_TYPES as readonly string[]).includes(e.tipo))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black">Inventario de producción</h2>
        <p className="mt-1 text-sm text-stone-500">Materia prima, café en grano, producto terminado de Gourmet y Blend, y bolsas de empaque.</p>
      </div>

      {[...alerts, ...empaqueAlerts].length > 0 ? (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={`mp-${i}`} className="flex gap-2 text-sm font-medium text-red-700">
              <XCircle className="mt-0.5 shrink-0" size={18} />
              <span><b>{a.title}.</b> {a.message}</span>
            </div>
          ))}
          {empaqueAlerts.map((a, i) => (
            <div key={`emp-${i}`} className="flex gap-2 text-sm font-medium text-red-700">
              <XCircle className="mt-0.5 shrink-0" size={18} />
              <span><b>{a.title}.</b> {a.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-2 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
          <span>Sin alertas: materia prima, café en grano y bolsas están por encima de su mínimo.</span>
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
              <div className="max-w-md">
                <GranoTotalCard totalLb={granoTotalLb(stock)} thresholdLb={thresholds.granoCafeteria} />
              </div>
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
              <p className="text-sm text-stone-500">Es el mismo café Gourmet; se embolsa en la producción en bolsa Comercial o Especial.</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="card p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-stone-500">Gourmet empacado</p>
                      <p className="mt-2 text-2xl font-black text-stone-900">{gourmetEmpacado.comercial + gourmetEmpacado.especial} bolsas <span className="text-base font-semibold text-stone-400">· {stock.gourmetLb.toFixed(2)} lb</span></p>
                    </div>
                    <div className="rounded-xl bg-amber-100 p-3 text-amber-700"><PackageCheck size={20} /></div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-stone-100 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Comercial</p><p className="mt-1 text-xl font-black text-stone-900">{gourmetEmpacado.comercial}</p></div>
                    <div className="rounded-xl bg-stone-100 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Especial</p><p className="mt-1 text-xl font-black text-stone-900">{gourmetEmpacado.especial}</p></div>
                  </div>
                  <p className="mt-3 text-xs text-stone-500">
                    Café suelto sin empacar: <b className="text-stone-700">{gourmetEmpacado.sueltoGramos.toFixed(1)} g</b>
                    {sueltoAlcanzaPara > 0 && <> — alcanza para {sueltoAlcanzaPara} bolsa{sueltoAlcanzaPara === 1 ? '' : 's'} más</>}
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button className="btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-40" disabled={gourmetEmpacado.comercial + gourmetEmpacado.especial <= 0} onClick={() => setGourmetSalidaOpen(true)}><ArrowDownCircle size={16} /> Enviar a cafetería</button>
                    <button className="btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-40" disabled={sueltoAlcanzaPara <= 0} onClick={() => setEmpacarSobranteOpen(true)}><Package size={16} /> Empacar sobrante</button>
                  </div>
                </div>
                <div className="card p-5">
                  <p className="text-sm text-stone-500">Bolsas vacías en bodega (para los próximos lotes)</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {empaqueProduccion.map(item => (
                      <div key={item.tipo} className="rounded-xl bg-stone-100 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{item.label.replace(' (Producción propia)', '')}</p>
                        <p className="mt-1 text-2xl font-black text-stone-900">{item.cantidad}</p>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="mt-3 text-xs font-semibold text-amber-700 hover:underline" onClick={() => setTab('empaque')}>
                    Comprar más / ver historial →
                  </button>
                </div>
              </div>
              <MonthlyHistory title="Historial de movimientos — Gourmet" materials={['gourmet']} />
            </>
          )}

          {tab === 'terminado-blend' && (
            <>
              <div className="max-w-md">
                <FinishedStockCard label="Blend" icon={Blend} lb={stock.blendFinishedLb} bags={blendBags} onSalida={() => setBlendSalidaOpen(true)} actionLabel="Enviar al mayoreo" />
              </div>
              <MonthlyHistory title="Historial de movimientos — Blend" materials={['blendBolsas']} />
            </>
          )}

          {tab === 'empaque' && (
            <>
              <div>
                <p className="mb-3 text-sm font-semibold text-stone-700">Clientes — empaque del café que se procesa para cada cliente</p>
                <div className="grid gap-4 md:grid-cols-3">
                  {empaqueClientes.map(item => (
                    <EmpaqueCard key={item.tipo} item={item} onEntrada={() => setEntradaEmpaque(item)} onEditar={() => setEditarEmpaque(item)} />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold text-stone-700">Producción propia — empaque de Gourmet y Blend</p>
                <div className="grid gap-4 md:grid-cols-3">
                  {empaqueProduccion.map(item => (
                    <EmpaqueCard key={item.tipo} item={item} onEntrada={() => setEntradaEmpaque(item)} onEditar={() => setEditarEmpaque(item)} />
                  ))}
                </div>
              </div>
              <EmpaqueHistory />
            </>
          )}
        </div>
      </div>

      {entradaMaterial && <EntradaModal material={entradaMaterial} onClose={() => setEntradaMaterial(null)} />}
      {editarMaterial && <EditarStockModal material={editarMaterial} stockLb={stock[editarMaterial]} onClose={() => setEditarMaterial(null)} />}
      {retiroGranoOpen && <RetiroGranoModal onClose={() => setRetiroGranoOpen(false)} />}
      {blendSalidaOpen && <BlendSalidaModal availableFullBags={blendBags.fullBags} onClose={() => setBlendSalidaOpen(false)} />}
      {gourmetSalidaOpen && <GourmetSalidaModal empacado={gourmetEmpacado} onClose={() => setGourmetSalidaOpen(false)} />}
      {empacarSobranteOpen && (
        <EmpacarSobranteModal
          sueltoGramos={gourmetEmpacado.sueltoGramos}
          alcanzaPara={sueltoAlcanzaPara}
          empaqueStock={empaqueProduccion}
          onClose={() => setEmpacarSobranteOpen(false)}
        />
      )}
      {entradaEmpaque && <EmpaqueEntradaModal item={entradaEmpaque} onClose={() => setEntradaEmpaque(null)} />}
      {editarEmpaque && <EmpaqueEditarModal item={editarEmpaque} onClose={() => setEditarEmpaque(null)} />}
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

/** Texto "Mínimo: …" que al hacer clic se vuelve un campo editable para cambiar el umbral de alerta. */
function MinimoEditor({ value, display, onSave }: { value: number, display: string, onSave: (v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [str, setStr] = useState(String(value))

  if (!editing) {
    return (
      <button className="mt-3 flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700" onClick={() => { setStr(String(value)); setEditing(true) }}>
        Mínimo: {display}
      </button>
    )
  }
  return (
    <div className="mt-3 flex items-center gap-2">
      <input type="number" min="0" step="1" autoFocus className="input" value={str} onChange={e => setStr(e.target.value)} />
      <button
        className="btn-secondary shrink-0 !px-3"
        onClick={async () => {
          try {
            await onSave(Number(str) || 0)
            setEditing(false)
          } catch (err) {
            window.alert(err instanceof Error ? err.message : 'No se pudo actualizar el mínimo.')
          }
        }}
      >
        Guardar
      </button>
    </div>
  )
}

/** Total de café en grano (los tres tuestes) con su mínimo: es la única alerta de grano. */
function GranoTotalCard({ totalLb, thresholdLb }: { totalLb: number, thresholdLb: number }) {
  const low = totalLb < thresholdLb
  return (
    <div className={`card p-5 ${low ? 'border-red-300' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-stone-500">Total en grano (todos los tuestes)</p>
          <p className={`mt-2 text-3xl font-black ${low ? 'text-red-600' : 'text-stone-900'}`}>{totalLb.toFixed(2)} <span className="text-base font-semibold text-stone-400">lb</span></p>
        </div>
        <div className={`rounded-xl p-3 ${low ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}><Coffee size={20} /></div>
      </div>
      <MinimoEditor value={thresholdLb} display={`${thresholdLb.toFixed(2)} lb`} onSave={updateGranoThreshold} />
    </div>
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

      <MinimoEditor value={thresholdLb} display={`${thresholdLb.toFixed(2)} lb`} onSave={onThresholdChange} />

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

function EmpaqueCard({ item, onEntrada, onEditar }: { item: EmpaqueStockItem, onEntrada: () => void, onEditar: () => void }) {
  const low = item.minimo != null && item.cantidad < item.minimo

  return (
    <div className={`card p-5 ${low ? 'border-red-300' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-stone-500">{item.label}</p>
          <p className={`mt-2 text-3xl font-black ${low ? 'text-red-600' : 'text-stone-900'}`}>{item.cantidad} <span className="text-base font-semibold text-stone-400">unidades</span></p>
        </div>
        <div className={`rounded-xl p-3 ${low ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}><Package size={20} /></div>
      </div>

      <MinimoEditor value={item.minimo ?? 0} display={item.minimo != null ? `${item.minimo} bolsas` : 'sin configurar'} onSave={v => updateEmpaqueUmbral(item.tipo, v)} />

      <button className="btn-primary mt-4 w-full" onClick={onEntrada}><ArrowUpCircle size={16} /> Registrar entrada</button>
      <button
        className="mt-2 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={item.cantidad <= 0}
        onClick={onEditar}
      >
        <Pencil size={12} /> Editar (restar una cantidad)
      </button>
    </div>
  )
}

function EmpaqueHistory() {
  const allMovements = useEmpaqueMovements()
  const empaqueStock = useEmpaqueStock()
  const [tipoFiltro, setTipoFiltro] = useState<string>('all')
  const [dia, setDia] = useState(todayISODate())
  const [verTodo, setVerTodo] = useState(false)

  const shown = useMemo(() => {
    let rows = allMovements
    if (tipoFiltro !== 'all') rows = rows.filter(m => m.tipoEmpaque === tipoFiltro)
    if (!verTodo) rows = rows.filter(m => localISODate(new Date(m.fecha)) === dia)
    return rows
  }, [allMovements, tipoFiltro, verTodo, dia])

  const labelFor = (tipo: string) => empaqueStock.find(e => e.tipo === tipo)?.label ?? tipo

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4">
        <h4 className="font-black">Historial de movimientos — Empaque</h4>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-52">
            <select className="select !py-2 text-sm" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}>
              <option value="all">Todos</option>
              {empaqueStock.map(e => <option key={e.tipo} value={e.tipo}>{e.label}</option>)}
            </select>
          </div>
          {!verTodo && <div className="w-40"><DatePickerField value={dia} onChange={setDia} /></div>}
          <button type="button" className="text-xs font-semibold text-amber-700 hover:underline" onClick={() => setVerTodo(v => !v)}>
            {verTodo ? 'Ver por día' : 'Ver todo el historial'}
          </button>
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
                <th className="px-4 pb-2 pt-4">Tipo de bolsa</th>
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
                  <td className="px-4 py-2.5 font-medium text-stone-900">{labelFor(m.tipoEmpaque)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${m.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {m.tipo === 'entrada' ? <ArrowUpCircle size={13} /> : <ArrowDownCircle size={13} />} {m.tipo === 'entrada' ? 'Entrada' : 'Salida'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{m.cantidad} unidades</td>
                  <td className="px-4 py-2.5 text-stone-500">{m.motivo}</td>
                  <td className="px-4 py-2.5 font-semibold text-stone-900">{m.saldoResultante}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EmpaqueEntradaModal({ item, onClose }: { item: EmpaqueStockItem, onClose: () => void }) {
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const cantidadNum = Math.floor(Number(cantidad) || 0)
    if (cantidadNum <= 0) { setError('Ingresa una cantidad mayor que 0.'); return }
    setSubmitting(true)
    try {
      await registrarEntradaEmpaque(item.tipo, cantidadNum, motivo)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la entrada.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title={`Entrada de ${item.label}`} onClose={onClose}>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
      <form onSubmit={handleSubmit}>
        <label className="block"><span className="label">Cantidad (unidades)</span><input type="number" min="0" step="1" autoFocus className="input" value={cantidad} onChange={e => { setError(''); setCantidad(e.target.value) }} /></label>
        <label className="mt-4 block"><span className="label">Motivo (opcional)</span><input className="input" placeholder="Compra a proveedor..." value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
        <button type="submit" className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting}>
          {submitting && <Loader2 size={16} className="animate-spin" />} Registrar entrada
        </button>
      </form>
    </Modal>
  )
}

function EmpaqueEditarModal({ item, onClose }: { item: EmpaqueStockItem, onClose: () => void }) {
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const cantidadNum = Math.floor(Number(cantidad) || 0)
    if (cantidadNum <= 0) { setError('Ingresa una cantidad mayor que 0.'); return }
    if (cantidadNum > item.cantidad) { setError(`Solo hay ${item.cantidad} unidades disponibles.`); return }
    setSubmitting(true)
    try {
      await registrarSalidaEmpaque(item.tipo, cantidadNum, motivo.trim() || 'Corrección de captura')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la corrección.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title={`Editar stock de ${item.label}`} onClose={onClose}>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
      <p className="mb-4 text-sm text-stone-500">Stock actual: <b className="text-stone-700">{item.cantidad} unidades</b>. Usa esto cuando se capturó de más en una entrada — ingresa cuánto restar (el exceso), no el total correcto.</p>
      <form onSubmit={handleSubmit}>
        <label className="block"><span className="label">Cantidad a restar (unidades)</span><input type="number" min="0" max={item.cantidad} step="1" autoFocus className="input" value={cantidad} onChange={e => { setError(''); setCantidad(e.target.value) }} /></label>
        <label className="mt-4 block"><span className="label">Motivo (opcional)</span><input className="input" placeholder="Corrección de captura" value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
        <button type="submit" className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting}>
          {submitting && <Loader2 size={16} className="animate-spin" />} Restar del inventario
        </button>
      </form>
    </Modal>
  )
}

function FinishedStockCard({ label, lb, bags, onSalida, icon: Icon = PackageCheck, actionLabel = 'Enviar a cafetería' }: { label: string, lb: number, bags: { fullBags: number, remainderGrams: number }, onSalida: () => void, icon?: typeof PackageCheck, actionLabel?: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-stone-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-stone-900">{bags.fullBags} bolsas empacadas <span className="text-base font-semibold text-stone-400">· {lb.toFixed(2)} lb</span></p>
          <p className="mt-1 text-xs text-stone-500">Café suelto sin empacar (sobrante): {bags.remainderGrams.toFixed(1)} g</p>
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

const NOTA_MAX_LENGTH = 140
const GOURMET_BAG_LABELS: Record<GourmetBagType, string> = { comercial: 'Comercial', especial: 'Especial' }

function NotaField({ nota, setNota }: { nota: string, setNota: (v: string) => void }) {
  return (
    <label className="mt-4 block">
      <span className="label">Nota (opcional)</span>
      <input className="input" maxLength={NOTA_MAX_LENGTH} value={nota} onChange={e => setNota(e.target.value)} />
      <span className="mt-1 block text-right text-xs text-stone-400">{nota.length}/{NOTA_MAX_LENGTH}</span>
    </label>
  )
}

function BlendSalidaModal({ availableFullBags, onClose }: { availableFullBags: number, onClose: () => void }) {
  const [bolsas, setBolsas] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const bolsasNum = Math.max(0, Math.floor(Number(bolsas) || 0))
    if (bolsasNum <= 0) { setError('Ingresa una cantidad de bolsas mayor que 0.'); return }
    if (bolsasNum > availableFullBags) { setError(`Solo hay ${availableFullBags} bolsas completas disponibles.`); return }
    setSubmitting(true)
    try {
      await enviarBlendTerminado(bolsasNum, nota.trim() ? `Envío al mayoreo — ${nota.trim()}` : 'Envío al mayoreo')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el envío.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Enviar bolsas de Blend al mayoreo" onClose={onClose}>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
      <p className="mb-3 text-sm text-stone-500">Bolsas completas disponibles: <b className="text-stone-700">{availableFullBags}</b></p>
      <form onSubmit={handleSubmit}>
        <label className="block"><span className="label">Bolsas a enviar</span><input type="number" min="0" max={availableFullBags} step="1" autoFocus className="input" value={bolsas} onChange={e => { setError(''); setBolsas(e.target.value) }} /></label>
        <NotaField nota={nota} setNota={setNota} />
        <button type="submit" className="btn-primary mt-1 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting}>
          {submitting && <Loader2 size={16} className="animate-spin" />} Registrar envío
        </button>
      </form>
    </Modal>
  )
}

function GourmetSalidaModal({ empacado, onClose }: { empacado: GourmetEmpacado, onClose: () => void }) {
  const [tipo, setTipo] = useState<GourmetBagType>(empacado.comercial > 0 ? 'comercial' : 'especial')
  const [bolsas, setBolsas] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const disponibles = empacado[tipo]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const bolsasNum = Math.max(0, Math.floor(Number(bolsas) || 0))
    if (bolsasNum <= 0) { setError('Ingresa una cantidad de bolsas mayor que 0.'); return }
    if (bolsasNum > disponibles) { setError(`Solo hay ${disponibles} bolsas ${GOURMET_BAG_LABELS[tipo]} llenas.`); return }
    setSubmitting(true)
    try {
      await descontarGourmetTerminado(tipo, bolsasNum, nota.trim() ? `Envío a cafetería — ${nota.trim()}` : 'Envío a cafetería')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el envío.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Enviar Gourmet a cafetería" onClose={onClose}>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
      <form onSubmit={handleSubmit}>
        <label className="block"><span className="label">Tipo de bolsa</span>
          <select className="select" value={tipo} onChange={e => { setError(''); setTipo(e.target.value as GourmetBagType) }}>
            <option value="comercial">Comercial ({empacado.comercial} llenas)</option>
            <option value="especial">Especial ({empacado.especial} llenas)</option>
          </select>
        </label>
        <label className="mt-4 block"><span className="label">Bolsas a enviar</span><input type="number" min="0" max={disponibles} step="1" autoFocus className="input" value={bolsas} onChange={e => { setError(''); setBolsas(e.target.value) }} /></label>
        <NotaField nota={nota} setNota={setNota} />
        <button type="submit" className="btn-primary mt-1 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting}>
          {submitting && <Loader2 size={16} className="animate-spin" />} Registrar envío
        </button>
      </form>
    </Modal>
  )
}

function EmpacarSobranteModal({ sueltoGramos, alcanzaPara, empaqueStock, onClose }: { sueltoGramos: number, alcanzaPara: number, empaqueStock: EmpaqueStockItem[], onClose: () => void }) {
  const [tipo, setTipo] = useState<GourmetBagType>('comercial')
  const [bolsas, setBolsas] = useState(String(alcanzaPara))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const vacias = empaqueStock.find(e => e.tipo === tipo)?.cantidad ?? 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const bolsasNum = Math.max(0, Math.floor(Number(bolsas) || 0))
    if (bolsasNum <= 0) { setError('Ingresa una cantidad de bolsas mayor que 0.'); return }
    if (bolsasNum > alcanzaPara) { setError(`El café suelto solo alcanza para ${alcanzaPara} bolsa${alcanzaPara === 1 ? '' : 's'}.`); return }
    if (bolsasNum > vacias) { setError(`Solo hay ${vacias} bolsas ${GOURMET_BAG_LABELS[tipo]} vacías en bodega.`); return }
    setSubmitting(true)
    try {
      await empacarSobranteGourmet(tipo, bolsasNum, '')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el empaque.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Empacar café suelto (sobrante)" onClose={onClose}>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
      <p className="mb-4 text-sm text-stone-500">Hay <b className="text-stone-700">{sueltoGramos.toFixed(1)} g</b> de café suelto, que alcanza para <b className="text-stone-700">{alcanzaPara}</b> bolsa{alcanzaPara === 1 ? '' : 's'} de {BAG_GRAMS} g. Regístralo cuando ya las hayan llenado: pasan a bolsas llenas y se descuenta la bolsa vacía.</p>
      <form onSubmit={handleSubmit}>
        <label className="block"><span className="label">Tipo de bolsa</span>
          <select className="select" value={tipo} onChange={e => { setError(''); setTipo(e.target.value as GourmetBagType) }}>
            {(['comercial', 'especial'] as const).map(t => (
              <option key={t} value={t}>{GOURMET_BAG_LABELS[t]} ({empaqueStock.find(e => e.tipo === t)?.cantidad ?? 0} vacías)</option>
            ))}
          </select>
        </label>
        <label className="mt-4 block"><span className="label">Bolsas llenadas</span><input type="number" min="1" max={alcanzaPara} step="1" autoFocus className="input" value={bolsas} onChange={e => { setError(''); setBolsas(e.target.value) }} /></label>
        <button type="submit" className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting}>
          {submitting && <Loader2 size={16} className="animate-spin" />} Registrar empaque
        </button>
      </form>
    </Modal>
  )
}
