import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Coffee, Loader2, Package, Wallet } from 'lucide-react'
import { fetchGastos, type GastoItem, type GastosResumen } from '../store/inventoryStore'
import { errorMessage } from '../components/ui/feedback'
import { todayISODate } from '../utils/production'
import { formatQ } from '../utils/money'

const MONTH_FORMAT = new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric' })

/** "YYYY-MM" → [primer día del mes, primer día del mes siguiente), en hora local. */
function monthRange(mes: string): [Date, Date] {
  const [y, m] = mes.split('-').map(Number)
  return [new Date(y, m - 1, 1), new Date(y, m, 1)]
}

export default function GastosPage() {
  const [mes, setMes] = useState(() => todayISODate().slice(0, 7))
  const [data, setData] = useState<GastosResumen | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!mes) return
    let cancelled = false
    setLoading(true)
    setError('')
    const [desde, hasta] = monthRange(mes)
    fetchGastos(desde, hasta)
      .then(r => { if (!cancelled) setData(r) })
      .catch(err => { if (!cancelled) setError(errorMessage(err, 'No se pudieron cargar los gastos.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mes])

  const periodoLabel = mes ? MONTH_FORMAT.format(new Date(`${mes}-01T00:00:00`)) : ''
  const materia = data?.items.filter(i => i.categoria === 'materia_prima') ?? []
  const empaque = data?.items.filter(i => i.categoria === 'empaque') ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="page-title">Control de gastos</h2>
          <p className="mt-1 text-sm text-stone-500">Lo que se pagó en compras de café y bolsas</p>
        </div>
        <input type="month" className="input w-48" value={mes} onChange={e => e.target.value && setMes(e.target.value)} aria-label="Mes" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label={`Total gastado (${periodoLabel})`} value={data?.total} icon={Wallet} highlight />
        <SummaryCard label="Materia prima" value={data?.totalMateriaPrima} icon={Coffee} />
        <SummaryCard label="Bolsas" value={data?.totalEmpaque} icon={Package} />
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      {!!data?.entradasSinCosto && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>
            {data.entradasSinCosto === 1 ? 'Hay 1 entrada' : `Hay ${data.entradasSinCosto} entradas`} de {periodoLabel} sin costo registrado, así que el total puede ser mayor.
            El costo se captura al registrar la entrada en <Link to="/inventario" className="font-semibold underline">Inventario</Link>.
          </p>
        </div>
      )}

      {loading && !data ? (
        <div className="flex min-h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-stone-400" /></div>
      ) : (
        <div className={`grid gap-6 xl:grid-cols-2 ${loading ? 'opacity-60' : ''}`}>
          <GastosTable title="Materia prima" items={materia} total={data?.totalMateriaPrima ?? 0} unidad="lb" periodoLabel={periodoLabel} />
          <GastosTable title="Bolsas" items={empaque} total={data?.totalEmpaque ?? 0} unidad="bolsa" periodoLabel={periodoLabel} />
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, icon: Icon, highlight = false }: { label: string, value: number | undefined, icon: typeof Wallet, highlight?: boolean }) {
  return (
    <div className={`card p-5 ${highlight ? 'ring-2 ring-amber-300' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-stone-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-stone-900">{value === undefined ? '—' : formatQ(value)}</p>
        </div>
        <div className="rounded-xl bg-amber-100 p-3 text-amber-700"><Icon size={20} /></div>
      </div>
    </div>
  )
}

function GastosTable({ title, items, total, unidad, periodoLabel }: { title: string, items: GastoItem[], total: number, unidad: 'lb' | 'bolsa', periodoLabel: string }) {
  const formatCantidad = (i: GastoItem) => unidad === 'lb' ? `${i.cantidad.toFixed(2)} lb` : `${i.cantidad} bolsas`
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-stone-200 p-4"><h4 className="font-bold">{title}</h4></div>
      {items.length === 0 ? (
        <p className="p-6 text-center text-sm text-stone-500">Sin compras de {title.toLowerCase()} en {periodoLabel}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                <th className="px-4 pb-2 pt-4">{unidad === 'lb' ? 'Material' : 'Tipo de bolsa'}</th>
                <th className="px-4 pb-2 pt-4">Entró</th>
                <th className="px-4 pb-2 pt-4">Precio promedio</th>
                <th className="px-4 pb-2 pt-4 text-right">Gasto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {items.map(i => (
                <tr key={i.clave}>
                  <td className="px-4 py-2.5 font-medium text-stone-900">
                    {i.label}
                    <span className="block text-xs font-normal text-stone-500">
                      {i.entradas === 1 ? '1 compra' : `${i.entradas} compras`}{i.entradasSinCosto > 0 && ` · ${i.entradasSinCosto} sin costo`}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">{formatCantidad(i)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{i.precioPromedio === null ? <span className="text-stone-400">—</span> : `${formatQ(i.precioPromedio)} / ${unidad}`}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold text-stone-900">{formatQ(i.costoTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 bg-stone-50">
                <td className="px-4 py-3 font-bold" colSpan={3}>Total {title.toLowerCase()}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-stone-900">{formatQ(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
