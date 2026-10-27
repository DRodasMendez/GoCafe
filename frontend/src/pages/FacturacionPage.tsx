import { useMemo, useState } from 'react'
import { CheckCircle2, FileDown, Loader2, ReceiptText, Search, Undo2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { setOrderPagado, useOrders } from '../store/ordersStore'
import { generateInvoicePdf } from '../utils/invoicePdf'
import { todayISODate } from '../utils/production'
import { formatQ } from '../utils/money'
import { confirmDialog, errorMessage, toast } from '../components/ui/feedback'
import { formatMonthKey } from '../components/ui/calendar'
import MonthPicker from '../components/MonthPicker'
import type { Order } from '../types/order'

const DATE_FORMAT = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })

type Vista = 'mes' | 'pendientes'

interface ClientGroup {
  clientId: string
  clientName: string
  orders: Order[]
}

/** ¿La fecha ISO cae en el mes "YYYY-MM" (hora local)? */
function inMonth(iso: string | null | undefined, mes: string): boolean {
  if (!iso) return false
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === mes
}

export default function FacturacionPage() {
  const allOrders = useOrders()
  const [mes, setMes] = useState(() => todayISODate().slice(0, 7))
  const [vista, setVista] = useState<Vista>('mes')
  const [search, setSearch] = useState('')
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [pagandoId, setPagandoId] = useState<string | null>(null)

  const finalizadas = useMemo(
    () => allOrders
      .filter(o => o.status === 'Finalizado')
      .sort((a, b) => (b.finalizedAt ?? b.updatedAt).localeCompare(a.finalizedAt ?? a.updatedAt)),
    [allOrders]
  )

  const periodoLabel = formatMonthKey(mes)
  // Por fecha de PAGO: una orden finalizada en septiembre y cobrada en octubre cuenta como cobrada en octubre.
  const cobradoMes = finalizadas.filter(o => o.pagado && inMonth(o.pagadoAt, mes)).reduce((s, o) => s + o.totalPrice, 0)
  const finalizadoMes = finalizadas.filter(o => inMonth(o.finalizedAt, mes)).reduce((s, o) => s + o.totalPrice, 0)
  const pendientes = finalizadas.filter(o => !o.pagado)
  const totalPendiente = pendientes.reduce((s, o) => s + o.totalPrice, 0)

  const filtered = useMemo(() => {
    let rows = vista === 'pendientes' ? finalizadas.filter(o => !o.pagado) : finalizadas.filter(o => inMonth(o.finalizedAt, mes))
    const term = search.trim().toLowerCase()
    if (term) rows = rows.filter(o => o.clientName.toLowerCase().includes(term) || o.orderNo.toLowerCase().includes(term))
    return rows
  }, [finalizadas, vista, mes, search])

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
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo generar el comprobante.'))
    } finally {
      setGeneratingId(null)
    }
  }

  const handlePago = async (order: Order) => {
    const marcarPagada = !order.pagado
    const ok = await confirmDialog(marcarPagada
      ? { title: `¿Registrar el pago de ${order.orderNo}?`, message: `${order.clientName} · ${formatQ(order.totalPrice)}. Contará como cobrado hoy.`, confirmLabel: 'Sí, está pagada' }
      : { title: `¿Deshacer el pago de ${order.orderNo}?`, message: 'La orden volverá a quedar pendiente de cobro.', confirmLabel: 'Deshacer pago', danger: true })
    if (!ok) return
    setPagandoId(order.id)
    try {
      await setOrderPagado(order.id, marcarPagada)
      toast.success(marcarPagada ? `${order.orderNo} registrada como pagada.` : `${order.orderNo} volvió a pendiente.`)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo actualizar el pago.'))
    } finally {
      setPagandoId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="page-title">Cobros</h2>
          <p className="mt-1 text-sm text-stone-500">Órdenes finalizadas de clientes y su pago.</p>
        </div>
        <MonthPicker value={mes} onChange={setMes} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-stone-500">Cobrado en {periodoLabel}</p>
          <p className="stat-value mt-2 text-emerald-600">{formatQ(cobradoMes)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-stone-500">Órdenes finalizadas en {periodoLabel}</p>
          <p className="stat-value mt-2">{formatQ(finalizadoMes)}</p>
        </div>
        <button type="button" className={`card p-5 text-left transition hover:border-red-300 ${vista === 'pendientes' ? 'ring-2 ring-red-200' : ''}`} onClick={() => setVista('pendientes')}>
          <p className="text-sm text-stone-500">Pendiente de cobro</p>
          <p className="stat-value mt-2 text-red-600">{formatQ(totalPendiente)}</p>
          {pendientes.length > 0 && <p className="mt-1 text-xs text-stone-500">{pendientes.length} {pendientes.length === 1 ? 'orden' : 'órdenes'} sin cobrar (de cualquier mes) · ver</p>}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-3">
          <div className="flex">
            <SegmentButton active={vista === 'mes'} onClick={() => setVista('mes')} label={`Finalizadas en ${periodoLabel}`} />
            <SegmentButton active={vista === 'pendientes'} onClick={() => setVista('pendientes')} label={`Pendientes de cobro${pendientes.length ? ` (${pendientes.length})` : ''}`} />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
            <Search size={15} className="text-stone-400" />
            <input className="w-44 bg-transparent text-sm outline-none" placeholder="Buscar cliente o folio..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center p-6 text-center">
            <ReceiptText size={22} className="mb-2 text-stone-300" />
            <p className="text-sm text-stone-500">
              {search
                ? `Sin resultados para "${search}".`
                : vista === 'pendientes' ? 'No hay órdenes pendientes de cobro.' : `No se finalizaron órdenes en ${periodoLabel}.`}
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
                    <Link to={`/clientes/${group.clientId}`} className="font-semibold text-stone-900 hover:underline">{group.clientName}</Link>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-stone-500">{group.orders.length} {group.orders.length === 1 ? 'orden' : 'órdenes'}</span>
                      <span className="font-semibold text-stone-900">{formatQ(subtotal)}</span>
                      {subtotalPendiente > 0 && <span className="font-semibold text-red-600">{formatQ(subtotalPendiente)} pendiente</span>}
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl bg-stone-50">
                    <table className="w-full min-w-[600px] text-left text-sm">
                      <thead>
                        <tr className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          <th className="px-3 pb-2 pt-3">Folio</th>
                          <th className="px-3 pb-2 pt-3">Finalizada</th>
                          <th className="px-3 pb-2 pt-3">Total</th>
                          <th className="px-3 pb-2 pt-3">Pago</th>
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
                            <td className="px-3 py-2.5 font-semibold text-stone-900">{formatQ(order.totalPrice)}</td>
                            <td className="px-3 py-2.5">
                              {order.pagado ? (
                                <span className="inline-flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                    <CheckCircle2 size={13} /> Pagada{order.pagadoAt ? ` · ${DATE_FORMAT.format(new Date(order.pagadoAt))}` : ''}
                                  </span>
                                  <button type="button" className="rounded-md p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40" title="Deshacer pago" aria-label="Deshacer pago" disabled={pagandoId === order.id} onClick={() => handlePago(order)}>
                                    <Undo2 size={14} />
                                  </button>
                                </span>
                              ) : (
                                <button type="button" className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs" disabled={pagandoId === order.id} onClick={() => handlePago(order)}>
                                  {pagandoId === order.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Registrar pago
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs"
                                disabled={generatingId === order.id}
                                onClick={() => handleGenerate(order)}
                                title="Descargar comprobante en PDF"
                              >
                                {generatingId === order.id ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Comprobante
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

function SegmentButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${active ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}`}>
      {label}
    </button>
  )
}
