import { Coffee, LayoutDashboard, LogOut, ReceiptText, Users, Wallet, Warehouse } from 'lucide-react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { logout } from '../store/authStore'

interface NavItem { to: string, label: string, icon: typeof Users }

/** El menú también da el título de la barra superior (ver AdminLayout). */
export const NAV_SECTIONS: { title: string | null, items: NavItem[] }[] = [
  {
    title: null,
    items: [{ to: '/', label: 'Inicio', icon: LayoutDashboard }],
  },
  {
    title: 'Operación',
    items: [
      { to: '/clientes', label: 'Clientes', icon: Users },
      { to: '/produccion', label: 'Producción', icon: Coffee },
      { to: '/inventario', label: 'Inventario', icon: Warehouse },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { to: '/facturacion', label: 'Cobros', icon: ReceiptText },
      { to: '/gastos', label: 'Gastos', icon: Wallet },
    ],
  },
]

export default function Sidebar({ open, onClose }: { open: boolean, onClose: () => void }) {
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-stone-950/50 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-stone-800 bg-stone-950 p-4 text-white transition-transform duration-200 lg:z-30 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Link to="/" onClick={onClose} className="mb-6 flex items-center gap-3 rounded-xl px-2 py-2">
          <img src="/images/cafelogo.jpg" alt="" className="h-11 w-11 rounded-full bg-white object-cover p-0.5" />
          <div className="leading-tight">
            <p className="font-bold">Go Café</p>
            <p className="text-xs text-stone-400">Sistema de producción</p>
          </div>
        </Link>
        <nav className="flex-1 space-y-5 overflow-y-auto">
          {NAV_SECTIONS.map(section => (
            <div key={section.title ?? 'inicio'}>
              {section.title && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-500">{section.title}</p>}
              <div className="space-y-1">
                {section.items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} end={to === '/'} onClick={onClose} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-amber-400 text-stone-950' : 'text-stone-300 hover:bg-stone-900 hover:text-white'}`}>
                    <Icon size={18} /> {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <button onClick={handleLogout} className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-stone-400 hover:bg-stone-900 hover:text-white"><LogOut size={18} /> Cerrar sesión</button>
      </aside>
    </>
  )
}
