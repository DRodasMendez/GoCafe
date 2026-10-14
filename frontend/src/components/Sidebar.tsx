import { Coffee, LayoutDashboard, LogOut, ReceiptText, Users, Wallet, Warehouse } from 'lucide-react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { logout } from '../store/authStore'

const items = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, enabled: true },
  { to: '/clientes', label: 'Clientes', icon: Users, enabled: true },
  { to: '/produccion', label: 'Producción', icon: Coffee, enabled: true },
  { to: '/inventario', label: 'Inventario', icon: Warehouse, enabled: true },
  { to: '/facturacion', label: 'Facturación', icon: ReceiptText, enabled: true },
  { to: '/gastos', label: 'Gastos', icon: Wallet, enabled: true },
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
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-stone-800 bg-stone-950 p-5 text-white transition-transform duration-200 lg:z-30 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Link to="/" onClick={onClose} className="mb-8 flex justify-center py-2">
          <div className="flex h-40 w-40 items-center justify-center rounded-full bg-white p-2 shadow-lg shadow-black/30">
            <img src="/images/cafelogo.jpg" alt="Logo GoCafe" className="h-full w-full rounded-full object-cover" />
          </div>
        </Link>
        <nav className="space-y-1.5">
          {items.map(({ to, label, icon: Icon, enabled }) => enabled ? (
            <NavLink key={label} to={to} end={to === '/'} onClick={onClose} className={({isActive}) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-amber-400 text-stone-950' : 'text-stone-300 hover:bg-stone-900 hover:text-white'}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ) : (
            <div key={label} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-stone-600">
              <span className="flex items-center gap-3"><Icon size={18} /> {label}</span><span className="text-[10px] uppercase">pronto</span>
            </div>
          ))}
        </nav>
        <div className="absolute bottom-5 left-5 right-5">
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-stone-400 hover:bg-stone-900 hover:text-white"><LogOut size={18}/> Cerrar sesión</button>
        </div>
      </aside>
    </>
  )
}
