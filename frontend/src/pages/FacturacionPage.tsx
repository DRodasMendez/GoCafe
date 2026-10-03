import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, FileDown, Loader2, ReceiptText, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { setOrderPagado, useOrders } from '../store/ordersStore'
import { generateInvoicePdf } from '../utils/invoicePdf'
import { localISODate, todayISODate } from '../utils/production'
import DatePickerField from '../components/DatePickerField'
import type { Order } from '../types/order'

const DATE_FORMAT = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })
const DAY_FORMAT = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'long', year: 'numeric' })
const MONTH_NAME_FORMAT = new Intl.DateTimeFormat('es-GT', { month: 'long' })
const MONEY_FORMAT = (v: number) => `Q${v.toFixed(2)}`

const FIRST_YEAR = 2026
const MESES = Array.from({ length: 12 }, (_, i) => capitalize(MONTH_NAME_FORMAT.format(new Date(2000, i, 1))))

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface ClientGroup {
  clientId: string
  clientName: string
  orders: Order[]
}

export default function FacturacionPage() {
  const allOrders = useOrders()
  const [search, setSearch] = useState('')
  const [dia, setDia] = useState(todayISODate())
  const [verTodo, setVerTodo] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  const now = new Date()
  const [mesSel, setMesSel] = useState(now.getMonth())
  const [anioSel, setAnioSel] = useState(now.getFullYear())

  const finalizadas = useMemo(
    () => allOrders
      .filter(o => o.status === 'Finalizado')
      .sort((a, b) => (b.finalizedAt ?? b.updatedAt).localeCompare(a.finalizedAt ?? a.updatedAt)),
    [allOrders]
  )

  const anios = useMemo(() => {
    const list: number[] = []
    for (let y = now.getFullYear(); y >= FIRST_YEAR; y--) list.push(y)
    return list
  }, [now.getFullYear()])

  // Por fecha de PAGO (no de finalización): una orden finalizada en septiembre y cobrada en octubre cuenta en octubre.
  const cobradoMes = useMemo(
    () => finalizadas
      .filter(o => {
        if (!o.pagado || !o.pagadoAt) return false
        const d = new Date(o.pagadoAt)
        return d.getFullYear() === anioSel && d.getMonth() === mesSel
      })
      .reduce((sum, o) => sum + o.totalPrice, 0),
    [finalizadas, anioSel, mesSel]
  )
  const facturadoAnio = useMemo(
    () => finalizadas.filter(o => o.finalizedAt && new Date(o.finalizedAt).getFullYear() === anioSel).reduce((sum, o) => sum + o.totalPrice, 0),
    [finalizadas, anioSel]
  )
  const totalCobrado = useMemo(() => finalizadas.filter(o => o.pagado).reduce((sum, o) => sum + o.totalPrice, 0), [finalizadas])
  const totalFacturado = useMemo(() => finalizadas.reduce((sum, o) => sum + o.totalPrice, 0), [finalizadas])
  const totalPendiente = totalFacturado - totalCobrado
  const pendientesCount = finalizadas.filter(o => !o.pagado).length

  const filtered = useMemo(() => {
    let rows = finalizadas
    if (!verTodo) rows = rows.filter(o => o.finalizedAt && localISODate(new Date(o.finalizedAt)) === dia)
    const term = search.trim().toLowerCase()
    if (term) rows = rows.filter(o => o.clientName.toLowerCase().includes(term) || o.orderNo.toLowerCase().includes(term))
    return rows
  }, [finalizadas, verTodo, dia, search])

  const groups = useMemo(() => {
    const map = new Map<string, ClientGroup>()
    for (const o of filtered) {
      if (!map.has(o.clientId)) map.set(o.clientId, { clientId: o.clientId, clientName: o.clientName || 'Cliente sin nombre', orders: [] })
      map.get(o.clientId)!.orders.push(o)
    }
    return Array.from(map.values())
  }, [filtered])

  const handleGenerate = async (order: Order) => {
    setGeneratingId(order.id)
    try {
      await generateInvoicePdf(order)
    } finally {
      setGeneratingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black">Facturación</h2>
        <p className="mt-1 text-sm text-stone-500">Facturas de todas las órdenes de clientes ya finalizadas, agrupadas por cliente.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-stone-500">Cobrado en</p>
            <select className="select !w-auto !py-1 text-xs" value={mesSel} onChange={e => setMesSel(Number(e.target.value))}>
              {MESES.map((nombre, i) => <option key={nombre} value={i}>{nombre}</option>)}
            </select>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-600">{MONEY_FORMAT(cobradoMes)}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-stone-500">Facturado en el año</p>
            <select className="select !w-auto !py-1 text-xs" value={anioSel} onChange={e => setAnioSel(Number(e.target.value))}>
              {anios.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <p className="mt-2 text-2xl font-black text-stone-900">{MONEY_FORMAT(facturadoAnio)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-stone-500">Pendiente de cobro</p>
          <p className="mt-2 text-2xl font-black text-red-600">{MONEY_FORMAT(totalPendiente)}</p>
          {pendientesCount > 0 && <p className="mt-1 text-xs text-stone-500">{pendientesCount} {pendientesCount === 1 ? 'orden' : 'órdenes'} sin cobrar</p>}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4">
          <h3 className="font-black">Órdenes facturadas por cliente</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
              <Search size={15} className="text-stone-400" />
              <input className="w-44 bg-transparent text-sm outline-none" placeholder="Buscar cliente o folio..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {!verTodo && <div className="w-40"><DatePickerField value={dia} onChange={setDia} /></div>}
            <button type="button" className="text-xs font-semibold text-amber-700 hover:underline" onClick={() => setVerTodo(v => !v)}>
              {verTodo ? 'Ver por día' : 'Ver todo el historial'}
            </button>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center p-6 text-center">
            <ReceiptText size={22} className="mb-2 text-stone-300" />
            <p className="text-sm text-stone-500">
              {search
                ? `Sin resultados para "${search}".`
                : verTodo
                  ? 'Todavía no hay órdenes finalizadas.'
                  : `Sin facturas el ${DAY_FORMAT.format(new Date(dia + 'T00:00:00'))}.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {groups.map(group => {
              const subtotal = group.orders.reduce((sum, o) => sum + o.totalPrice, 0)
              const subtotalPendiente = group.orders.filter(o => !o.pagado).reduce((sum, o) => sum + o.totalPrice, 0)
              return (
                <div key={group.clientId} className="p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/clientes/${group.clientId}`} className="font-black text-stone-900 hover:underline">{group.clientName}</Link>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-stone-500">{group.orders.length} {group.orders.length === 1 ? 'orden' : 'órdenes'}</span>
                      <span className="font-semibold text-stone-900">{MONEY_FORMAT(subtotal)}</span>
                      {subtotalPendiente > 0 && <span className="font-semibold text-red-600">{MONEY_FORMAT(subtotalPendiente)} pendiente</span>}
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl bg-stone-50">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          <th className="px-3 pb-2 pt-3">Folio</th>
                          <th className="px-3 pb-2 pt-3">Fecha</th>
                          <th className="px-3 pb-2 pt-3">Total</th>
                          <th className="px-3 pb-2 pt-3">Estado</th>
                          <th className="px-3 pb-2 pt-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200">
                        {group.orders.map(order => (
                          <tr key={order.id}>
                            <td className="px-3 py-2.5 font-semibold text-stone-900">
                              <Link to={`/clientes/ordenes/${order.id}`} className="hover:underline">{order.orderNo}</Link>
                            </td>
                            <td className="px-3 py-2.5 text-stone-500">{order.finalizedAt ? DATE_FORMAT.format(new Date(order.finalizedAt)) : '—'}</td>
                            <td className="px-3 py-2.5 font-semibold text-stone-900">{MONEY_FORMAT(order.totalPrice)}</td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => setOrderPagado(order.id, !order.pagado).catch(err => window.alert(err instanceof Error ? err.message : 'No se pudo actualizar el pago.'))}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${order.pagado ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                              >
                                {order.pagado ? <CheckCircle2 size={13} /> : <Circle size={13} />} {order.pagado ? 'Pagado' : 'Pendiente'}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                className="btn-secondary !px-3 !py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={generatingId === order.id}
                                onClick={() => handleGenerate(order)}
                              >
                                {generatingId === order.id ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Factura
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
