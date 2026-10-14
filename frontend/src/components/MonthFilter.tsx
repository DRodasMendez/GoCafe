import { X } from 'lucide-react'
import { todayISODate } from '../utils/production'

/** Selector de mes ("YYYY-MM"); vacío = todo el historial. */
export default function MonthFilter({ value, onChange }: { value: string, onChange: (mes: string) => void }) {
  if (!value) {
    return (
      <button type="button" className="btn-secondary !min-h-0 !py-2 text-xs" onClick={() => onChange(todayISODate().slice(0, 7))}>
        Todo el historial · ver por mes
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <input type="month" className="input !w-44 !py-2" value={value} onChange={e => e.target.value && onChange(e.target.value)} aria-label="Mes" />
      <button type="button" className="icon-btn" title="Ver todo el historial" aria-label="Ver todo el historial" onClick={() => onChange('')}><X size={15} /></button>
    </div>
  )
}
