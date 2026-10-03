import { useMemo, useState } from 'react'
import { CalendarDays, Pencil, Plus, Search, Trash2, UserRound, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { deleteClient, useClientsWithOrders } from '../store/clientsStore'

const REGISTERED_FORMAT = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })

export default function ClientesPage() {
  const clients = useClientsWithOrders()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return clients
    const digits = term.replace(/\D/g, '')
    return clients.filter(c =>
      c.name.toLowerCase().includes(term) || (digits && c.phone.replace(/\D/g, '').includes(digits))
    )
  }, [clients, search])

  const handleDelete = async (e: React.MouseEvent, clientId: string, name: string, orderCount: number) => {
    e.stopPropagation()
    const warning = orderCount > 0
      ? `¿Eliminar a ${name || 'este cliente'}? También se eliminarán sus ${orderCount} orden${orderCount === 1 ? '' : 'es'} en proceso.`
      : `¿Eliminar a ${name || 'este cliente'}?`
    if (!window.confirm(warning)) return
    try {
      await deleteClient(clientId)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar el cliente.')
    }
  }

  const handleEdit = (e: React.MouseEvent, clientId: string) => {
    e.stopPropagation()
    navigate(`/clientes/${clientId}/editar`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><h2 className="text-2xl font-black">Clientes</h2><p className="mt-1 text-sm text-stone-500">Registro de clientes y órdenes de trabajo.</p></div>
        <Link className="btn-primary" to="/clientes/nuevo"><Plus size={18}/> Agregar nuevo cliente</Link>
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-stone-200 p-4">
          <div className="flex max-w-sm items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
            <Search size={17} className="text-stone-400"/>
            <input
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Buscar cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {clients.length === 0 && (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 rounded-2xl bg-stone-100 p-4 text-stone-500"><Users size={28}/></div>
            <h3 className="font-bold">Aún no hay clientes registrados</h3>
            <p className="mt-1 max-w-md text-sm text-stone-500">Agrega tu primer cliente para empezar.</p>
          </div>
        )}

        {clients.length > 0 && filteredClients.length === 0 && (
          <div className="flex min-h-40 flex-col items-center justify-center p-8 text-center">
            <p className="text-sm text-stone-500">Sin resultados para "{search}".</p>
          </div>
        )}

        {filteredClients.length > 0 && (
          <div className="divide-y divide-stone-100">
            {filteredClients.map(client => {
              // Un cliente con órdenes finalizadas no se puede borrar (se perdería su historial de facturación).
              const finalizadas = client.orders.filter(o => o.status === 'Finalizado').length
              return (
              <div
                key={client.id}
                role="button"
                tabIndex={0}
                className="flex w-full items-center gap-4 p-4 text-left hover:bg-stone-50"
                onClick={() => navigate(`/clientes/${client.id}`)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(`/clientes/${client.id}`) }}
              >
                <div className="rounded-xl bg-stone-100 p-2.5 text-stone-500"><UserRound size={18} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-stone-900">{client.name || 'Sin nombre'}</p>
                  <p className="text-sm text-stone-500">{client.phone || '—'} · {client.orders.length} {client.orders.length === 1 ? 'orden' : 'órdenes'}</p>
                </div>
                <span className="hidden shrink-0 items-center gap-1.5 text-xs text-stone-400 sm:inline-flex">
                  <CalendarDays size={13} /> Registrado {REGISTERED_FORMAT.format(new Date(client.createdAt))}
                </span>
                <button
                  type="button"
                  className="icon-btn shrink-0"
                  title="Editar cliente"
                  onClick={e => handleEdit(e, client.id)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn-danger shrink-0 disabled:cursor-not-allowed disabled:opacity-30"
                  disabled={finalizadas > 0}
                  title={finalizadas > 0 ? `No se puede eliminar: tiene ${finalizadas} orden${finalizadas === 1 ? '' : 'es'} finalizada${finalizadas === 1 ? '' : 's'} con factura` : 'Eliminar cliente'}
                  onClick={e => handleDelete(e, client.id, client.name, client.orders.length)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
