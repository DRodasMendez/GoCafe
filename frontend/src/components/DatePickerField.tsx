import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import { CalendarDays } from 'lucide-react'
import 'react-day-picker/style.css'

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

const DISPLAY_FORMAT = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })

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
  const [coords, setCoords] = useState<{ top: number, left: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const selected = fromISODate(value)

  const updateCoords = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setCoords({ top: rect.bottom + 8, left: rect.left })
  }

  useEffect(() => {
    if (!open) return
    updateCoords()
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target) || popupRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', updateCoords, true)
    window.addEventListener('resize', updateCoords)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', updateCoords, true)
      window.removeEventListener('resize', updateCoords)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Una vez montado el popup, lo acomoda dentro de la ventana si se sale por la derecha o por abajo.
  useLayoutEffect(() => {
    if (!open || !coords || !popupRef.current) return
    const rect = popupRef.current.getBoundingClientRect()
    let { top, left } = coords
    const margin = 8
    if (left + rect.width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - rect.width - margin)
    if (top + rect.height > window.innerHeight - margin) top = Math.max(margin, (buttonRef.current?.getBoundingClientRect().top ?? top) - rect.height - 8)
    if (top !== coords.top || left !== coords.left) setCoords({ top, left })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, coords?.top, coords?.left])

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className="input flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className={selected ? 'text-stone-900' : 'text-stone-400'}>
          {selected ? DISPLAY_FORMAT.format(selected) : placeholder}
        </span>
        <CalendarDays size={16} className="shrink-0 text-amber-600" />
      </button>

      {open && coords && createPortal(
        <div
          ref={popupRef}
          className="fixed z-50 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl"
          style={{ top: coords.top, left: coords.left }}
        >
          <DayPicker
            mode="single"
            locale={es}
            captionLayout="dropdown"
            startMonth={new Date(2015, 0)}
            endMonth={new Date(new Date().getFullYear() + 3, 11)}
            selected={selected}
            defaultMonth={selected}
            onSelect={date => {
              if (date) {
                onChange(toISODate(date))
                setOpen(false)
              }
            }}
          />
        </div>,
        document.body
      )}
    </div>
  )
}
