import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar, { NAV_SECTIONS } from './Sidebar'

/** Nombre de la sección actual según la ruta (ej. /clientes/123 → "Clientes"). */
function useSectionTitle(): string {
  const { pathname } = useLocation()
  const items = NAV_SECTIONS.flatMap(s => s.items)
  const match = items
    .filter(i => i.to === '/' ? pathname === '/' : pathname === i.to || pathname.startsWith(`${i.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0]
  return match?.label ?? 'Go Café'
}

export default function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const title = useSectionTitle()

  return (
    <div className="min-h-screen bg-stone-100">
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="lg:pl-64">
        {/* En pantallas grandes el menú siempre está visible y cada página ya trae su título, así que la barra solo hace falta en celular/tablet. */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button type="button" className="icon-btn" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menú">
            <Menu size={18} />
          </button>
          <img src="/images/cafelogo.jpg" alt="" className="h-8 w-8 rounded-full object-cover" />
          <p className="font-semibold text-stone-900">Go Café <span className="font-normal text-stone-400">· {title}</span></p>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  )
}
