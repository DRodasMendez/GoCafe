import { useState } from 'react'
import { ArrowLeft, FileDown, Loader2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useOrder, useOrdersLoaded } from '../store/ordersStore'
import { generateInvoicePdf } from '../utils/invoicePdf'
import StatusProgressBar from '../components/StatusProgressBar'
import OrderSummary from '../components/OrderSummary'

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const loaded = useOrdersLoaded()
  const order = useOrder(id)
  const [generating, setGenerating] = useState(false)

  if (!loaded) return null

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link to="/clientes" className="rounded-xl border border-stone-200 bg-white p-2.5 inline-flex"><ArrowLeft size={18} /></Link>
        <div className="card p-6 text-center text-stone-600">Orden no encontrada.</div>
      </div>
    )
  }

  const isFinalized = order.status === 'Finalizado'

  const handleGenerateInvoice = async () => {
    setGenerating(true)
    try {
      await generateInvoicePdf(order)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to={`/clientes/${order.clientId}`} className="rounded-xl border border-stone-200 bg-white p-2.5"><ArrowLeft size={18} /></Link>
          <div>
            <h2 className="text-2xl font-black">{order.clientName || 'Cliente sin nombre'}</h2>
            <p className="text-sm text-stone-500">Orden {order.orderNo} · Tel. {order.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!isFinalized || generating}
            title={isFinalized ? 'Generar factura en PDF' : 'La orden debe estar finalizada para generar la factura'}
            onClick={handleGenerateInvoice}
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            Generar factura
          </button>
        </div>
      </div>

      <div className="card p-5">
        <StatusProgressBar status={order.status} />
      </div>

      <OrderSummary order={order} />
    </div>
  )
}
