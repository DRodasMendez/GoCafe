import { ArrowLeft, MapPin, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useClient, useClientsLoaded } from '../store/clientsStore'
import { deleteOrder, useClientOrders } from '../store/ordersStore'
import StatusProgressBar from '../components/StatusProgressBar'

export default function ClienteDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const loaded = useClientsLoaded()
  const client = useClient(clientId)
  const orders = useClientOrders(clientId)

  if (!loaded) return null

  if (!client) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Link to="/clientes" className="rounded-xl border border-stone-200 bg-white p-2.5 inline-flex"><ArrowLeft size={18} /></Link>
        <div className="card p-6 text-center text-stone-600">Cliente no encontrado.</div>
      </div>
    )
  }

  const handleDeleteOrder = async (orderId: string, orderNo: string) => {
    if (!window.confirm(`¿Eliminar la orden ${orderNo}? Esta acción no se puede deshacer.`)) return
    try {
      await deleteOrder(orderId)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar la orden.')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <Link to="/clientes" className="rounded-xl border border-stone-200 bg-white p-2.5"><ArrowLeft size={18} /></Link>
          <div>
            <h2 className="text-2xl font-black">{client.name || 'Sin nombre'}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
              <span className="inline-flex items-center gap-1"><Phone size={14} /> {client.phone || '—'}</span>
              <span className="inline-flex items-center gap-1"><MapPin size={14} /> {client.city || '—'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/clientes/${client.id}/ordenes/nueva`} className="btn-primary"><Plus size={18} /> Agregar nueva orden</Link>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-stone-200 p-4">
          <h3 className="font-black">Órdenes registradas</h3>
          <p className="text-sm text-stone-500">{orders.length} {orders.length === 1 ? 'orden' : 'órdenes'} en total.</p>
        </div>

        {orders.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center p-8 text-center">
            <p className="text-sm text-stone-500">Este cliente todavía no tiene órdenes.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {orders.map(order => {
              const isFinalized = order.status === 'Finalizado'
              return (
                <div key={order.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isFinalized && (
                      <Link to={`/clientes/ordenes/${order.id}/editar`} className="icon-btn" title="Editar orden"><Pencil size={16} /></Link>
                    )}
                    <button className="icon-btn-danger" title="Eliminar orden" onClick={() => handleDeleteOrder(order.id, order.orderNo)}><Trash2 size={16} /></button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-stone-900">{order.orderNo}</p>
                    <p className="text-xs text-stone-500">Recibido {order.receivedDate || '—'}</p>
                  </div>
                  <div className="w-44 shrink-0"><StatusProgressBar status={order.status} compact /></div>
                  {isFinalized ? (
                    <Link to={`/clientes/ordenes/${order.id}`} className="btn-secondary shrink-0">Ver detalle</Link>
                  ) : (
                    <Link to={`/clientes/ordenes/${order.id}/editar`} className="btn-primary shrink-0">Continuar</Link>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
