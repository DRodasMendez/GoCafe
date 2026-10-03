/** Piezas de formulario compartidas por los asistentes (órdenes y producción) y las pantallas de detalle. */

export function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}

export function SectionTitle({ title, subtitle }: { title: string, subtitle: string }) {
  return <div className="mb-6"><h3 className="text-lg font-black">{title}</h3><p className="mt-1 text-sm text-stone-500">{subtitle}</p></div>
}

export function Stat({ label, value }: { label: string, value: string }) {
  return <div className="rounded-xl bg-stone-100 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-1 text-xl font-black text-stone-900">{value}</p></div>
}
