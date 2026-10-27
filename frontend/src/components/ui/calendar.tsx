import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Piezas compartidas por el calendario de fechas y el selector de mes, para que se vean iguales. */

export const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const MONTHS_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** "2026-10" → "Octubre 2026". */
export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return y && m ? `${MONTHS_LONG[m - 1]} ${y}` : ''
}

export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

/** Encabezado "‹  Título  ›" de los dos calendarios. */
export function CalendarHeader({ title, onTitleClick, onPrev, onNext, prevDisabled, nextDisabled, titleHint }: {
  title: string
  onTitleClick?: () => void
  onPrev: () => void
  onNext: () => void
  prevDisabled?: boolean
  nextDisabled?: boolean
  titleHint?: string
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <NavButton label="Anterior" onClick={onPrev} disabled={prevDisabled}><ChevronLeft size={16} /></NavButton>
      {onTitleClick ? (
        <button type="button" onClick={onTitleClick} title={titleHint} className="rounded-lg px-2.5 py-1 text-sm font-semibold text-stone-900 transition hover:bg-stone-100">
          {title}
        </button>
      ) : (
        <span className="px-2.5 py-1 text-sm font-semibold text-stone-900">{title}</span>
      )}
      <NavButton label="Siguiente" onClick={onNext} disabled={nextDisabled}><ChevronRight size={16} /></NavButton>
    </div>
  )
}

function NavButton({ label, onClick, disabled, children }: { label: string, onClick: () => void, disabled?: boolean, children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/** Cuadrícula de 12 meses de un año (vista "elegir mes"). */
export function MonthGrid({ year, selectedKey, currentKey, maxKey, onSelect }: {
  year: number
  selectedKey?: string
  currentKey: string
  maxKey?: string
  onSelect: (key: string) => void
}) {
  return (
    <div className="grid w-64 grid-cols-3 gap-1.5">
      {MONTHS_SHORT.map((name, i) => {
        const key = monthKey(year, i)
        const selected = key === selectedKey
        const current = key === currentKey
        const disabled = maxKey !== undefined && key > maxKey
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(key)}
            className={`h-10 rounded-lg text-sm transition disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent ${
              selected
                ? 'bg-amber-500 font-semibold text-stone-950'
                : current
                  ? 'font-semibold text-amber-700 ring-1 ring-inset ring-amber-300 hover:bg-amber-50'
                  : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            {name}
          </button>
        )
      })}
    </div>
  )
}

export function CalendarFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex items-center justify-between gap-2 border-t border-stone-100 pt-2.5">{children}</div>
}

export function FooterButton({ onClick, children, muted = false }: { onClick: () => void, children: React.ReactNode, muted?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${muted ? 'text-stone-500 hover:bg-stone-100 hover:text-stone-800' : 'text-amber-700 hover:bg-amber-50'}`}>
      {children}
    </button>
  )
}
