import { useRef, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import Popover from './ui/Popover'
import { CalendarFooter, CalendarHeader, FooterButton, MonthGrid, formatMonthKey } from './ui/calendar'
import { todayISODate } from '../utils/production'

/** Suma meses a una clave "YYYY-MM". */
function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Selector de mes para los filtros ("YYYY-MM"). Reemplaza al <input type="month"> del navegador,
 * que se ve distinto en cada uno (y en algunos ni existe). Las flechas cambian de mes de un toque;
 * el botón del centro abre la cuadrícula de meses. No deja elegir meses futuros: no hay datos.
 * allowAll: agrega "Todo el historial" (value = '').
 */
export default function MonthPicker({ value, onChange, allowAll = false }: {
  value: string
  onChange: (mes: string) => void
  allowAll?: boolean
}) {
  const current = todayISODate().slice(0, 7)
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Number((value || current).slice(0, 4)))
  const anchorRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (!open) setYear(Number((value || current).slice(0, 4)))
    setOpen(o => !o)
  }
  const choose = (key: string) => { onChange(key); setOpen(false) }

  return (
    <div ref={anchorRef} className="inline-flex h-10 items-stretch rounded-xl border border-stone-300 bg-white shadow-sm">
      {value && (
        <button type="button" aria-label="Mes anterior" title="Mes anterior" onClick={() => onChange(addMonths(value, -1))}
          className="flex w-9 items-center justify-center rounded-l-xl border-r border-stone-200 text-stone-500 transition hover:bg-stone-50 hover:text-stone-900">
          <ChevronLeft size={16} />
        </button>
      )}
      <button type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open}
        className={`flex min-w-40 items-center justify-between gap-2 px-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 ${value ? '' : 'rounded-xl'} ${open ? 'bg-stone-50' : ''}`}>
        <span className="flex items-center gap-2"><CalendarDays size={15} className="text-stone-400" /> {value ? formatMonthKey(value) : 'Todo el historial'}</span>
        <ChevronDown size={15} className={`text-stone-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {value && (
        <button type="button" aria-label="Mes siguiente" title="Mes siguiente" disabled={value >= current} onClick={() => onChange(addMonths(value, 1))}
          className="flex w-9 items-center justify-center rounded-r-xl border-l border-stone-200 text-stone-500 transition hover:bg-stone-50 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronRight size={16} />
        </button>
      )}

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} align="end">
        <CalendarHeader title={String(year)} onPrev={() => setYear(y => y - 1)} onNext={() => setYear(y => y + 1)} nextDisabled={year >= Number(current.slice(0, 4))} />
        <MonthGrid year={year} selectedKey={value || undefined} currentKey={current} maxKey={current} onSelect={choose} />
        <CalendarFooter>
          <FooterButton onClick={() => choose(current)}>Este mes</FooterButton>
          {allowAll && <FooterButton muted onClick={() => choose('')}>Todo el historial</FooterButton>}
        </CalendarFooter>
      </Popover>
    </div>
  )
}
