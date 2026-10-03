import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="min-h-screen bg-stone-100">
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stone-200 bg-white/90 px-4 backdrop-blur sm:h-20 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button type="button" className="icon-btn lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menú">
              <Menu size={18} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Sistema de producción</p>
              <h1 className="text-lg font-bold text-stone-900">Panel administrativo</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-sm font-bold text-white">GC</div>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  )
}
