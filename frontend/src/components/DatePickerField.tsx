import { useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import { CalendarDays, ChevronDown } from 'lucide-react'
import Popover from './ui/Popover'
import { CalendarFooter, CalendarHeader, FooterButton, MONTHS_LONG, MonthGrid, monthKey } from './ui/calendar'
import { todayISODate } from '../utils/production'

function fromISODate(value: string): Date | undefined {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

function toISODate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const DISPLAY_FORMAT = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })
const WEEKDAY_FORMAT = new Intl.DateTimeFormat('es-GT', { weekday: 'short' })

/** "lun" → "Lu", "sáb" → "Sá". */
const weekdayName = (d: Date) => {
  const s = WEEKDAY_FORMAT.format(d)
  return s.charAt(0).toUpperCase() + s.charAt(1)
}

/**
 * Sin la hoja de estilos de react-day-picker: todo el aspecto sale de aquí, con los mismos
 * colores y radios que el resto del sistema. Los modificadores (seleccionado, hoy, fuera del
 * mes) se aplican a la celda, por eso apuntan al botón de adentro con [&>button].
 */
const DAY_CLASSES = {
  root: 'select-none',
  months: '',
  month: '',
  month_caption: 'sr-only',
  month_grid: 'border-collapse',
  weekdays: '',
  weekday: 'h-8 w-10 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-400',
  weeks: '',
  week: '',
  day: 'p-0.5 text-center',
  day_button: 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm text-stone-700 transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40',
}

const DAY_MODIFIERS = {
  today: '[&>button]:font-bold [&>button]:text-amber-700 [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-amber-300',
  outside: '[&>button]:text-stone-300',
  selected: '[&>button]:!bg-amber-500 [&>button]:!font-semibold [&>button]:!text-stone-950 [&>button]:!ring-0 [&>button]:shadow-sm',
}

export default function DatePickerField({
  value,
  onChange,
  placeholder = 'Seleccionar fecha',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'days' | 'months'>('days')
  const selected = fromISODate(value)
  const [month, setMonth] = useState<Date>(() => selected ?? new Date())
  const buttonRef = useRef<HTMLButtonElement>(null)

  const toggle = () => {
    if (!open) {
      setMonth(selected ?? new Date())
      setView('days')
    }
    setOpen(o => !o)
  }

  const pick = (date: Date) => {
    onChange(toISODate(date))
    setOpen(false)
  }

  const shiftMonth = (delta: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  const shiftYear = (delta: number) => setMonth(m => new Date(m.getFullYear() + delta, m.getMonth(), 1))
  const today = new Date()

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={`input flex items-center justify-between gap-2 text-left ${open ? '!border-amber-500 !ring-4 !ring-amber-500/10' : ''}`}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={`flex items-center gap-2 ${selected ? 'text-stone-900' : 'text-stone-400'}`}>
          <CalendarDays size={16} className="shrink-0 text-stone-400" />
          {selected ? DISPLAY_FORMAT.format(selected) : placeholder}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-stone-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={buttonRef}>
        {view === 'days' ? (
          <>
            <CalendarHeader
              title={`${MONTHS_LONG[month.getMonth()]} ${month.getFullYear()}`}
              titleHint="Elegir otro mes o año"
              onTitleClick={() => setView('months')}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
            />
            <DayPicker
              mode="single"
              locale={es}
              month={month}
              onMonthChange={setMonth}
              hideNavigation
              showOutsideDays
              fixedWeeks
              selected={selected}
              onSelect={date => { if (date) pick(date) }}
              classNames={DAY_CLASSES}
              modifiersClassNames={DAY_MODIFIERS}
              formatters={{ formatWeekdayName: weekdayName }}
            />
          </>
        ) : (
          <>
            <CalendarHeader title={String(month.getFullYear())} onPrev={() => shiftYear(-1)} onNext={() => shiftYear(1)} />
            <MonthGrid
              year={month.getFullYear()}
              selectedKey={selected ? monthKey(selected.getFullYear(), selected.getMonth()) : undefined}
              currentKey={monthKey(today.getFullYear(), today.getMonth())}
              onSelect={key => {
                const [y, m] = key.split('-').map(Number)
                setMonth(new Date(y, m - 1, 1))
                setView('days')
              }}
            />
          </>
        )}
        <CalendarFooter>
          <FooterButton onClick={() => pick(fromISODate(todayISODate())!)}>Hoy</FooterButton>
          <FooterButton muted onClick={() => setOpen(false)}>Cerrar</FooterButton>
        </CalendarFooter>
      </Popover>
    </div>
  )
}
