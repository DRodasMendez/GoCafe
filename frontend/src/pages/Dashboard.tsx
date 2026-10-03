import { useMemo } from 'react'
import { AlertTriangle, ArrowRight, Coffee, Users, Warehouse } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useClients } from '../store/clientsStore'
import { useOrders } from '../store/ordersStore'
import { useAllProductions } from '../store/productionStore'
import { bagsEquivalent, getEmpaqueAlerts, getInventoryAlerts, useEmpaqueStock, useGourmetEmpacado, useInventory } from '../store/inventoryStore'

export default function Dashboard() {
  const clients = useClients()
  const orders = useOrders()
  const productions = useAllProductions()
  const { stock, thresholds } = useInventory()
  const empaqueStock = useEmpaqueStock()
  const alerts = useMemo(() => [...getInventoryAlerts(), ...getEmpaqueAlerts()], [stock, thresholds, empaqueStock])

  const ordersInProgress = orders.filter(o => o.status !== 'Finalizado').length
  const rawMaterialLb = stock.pergamino + stock.oro + stock.natural
  const productionInProgress = productions.filter(p => p.status === 'en_proceso').length
  const blendBags = bagsEquivalent(stock.blendFinishedLb).fullBags
  const gourmetEmpacado = useGourmetEmpacado()
  const gourmetBags = gourmetEmpacado.comercial + gourmetEmpacado.especial

  const cards = [
    { label: 'Clientes activos', value: String(clients.length), icon: Users },
    { label: 'Órdenes de clientes en proceso', value: String(ordersInProgress), icon: Coffee },
    { label: 'Materia prima en bodega', value: `${rawMaterialLb.toFixed(0)} lb`, icon: Warehouse },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-stone-900">Resumen general</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card p-5">
            <div className="flex items-start justify-between">
              <div><p className="text-sm text-stone-500">{label}</p><p className="mt-2 text-3xl font-black text-stone-900">{value}</p></div>
              <div className="rounded-xl bg-amber-100 p-3 text-amber-700"><Icon size={20} /></div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-black">Alertas de inventario</h3>
            <Link to="/inventario" className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:underline">Ver inventario <ArrowRight size={14} /></Link>
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-stone-500">✓ Sin alertas. Las existencias están dentro de los mínimos establecidos.</p>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 4).map((a, i) => (
                <div key={i} className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                  <span>{a.message}</span>
                </div>
              ))}
              {alerts.length > 4 && <p className="text-xs text-stone-500">+{alerts.length - 4} alerta{alerts.length - 4 === 1 ? '' : 's'} más.</p>}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-black">Producción Go Café</h3>
            <Link to="/produccion" className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:underline">Ver producción <ArrowRight size={14} /></Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-stone-100 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Lotes en proceso</p><p className="mt-1 text-2xl font-black text-stone-900">{productionInProgress}</p></div>
            <div className="rounded-xl bg-stone-100 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Bolsas de Blend</p><p className="mt-1 text-2xl font-black text-stone-900">{blendBags}</p></div>
            <div className="rounded-xl bg-stone-100 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Bolsas de Gourmet</p><p className="mt-1 text-2xl font-black text-stone-900">{gourmetBags}</p><p className="text-xs text-stone-500">{gourmetEmpacado.comercial} Comercial · {gourmetEmpacado.especial} Especial</p></div>
          </div>
        </div>
      </div>
    </div>
  )
}
