import { useMemo, useState } from 'react'
import { Blend, Boxes, Coffee, PackageCheck, Trash2, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { PRODUCTION_STATUS_LABELS, roastedAllocatedLb, type Production } from '../types/production'
import { deleteBlendProduction, deleteGourmetProduction, useAllProductions } from '../store/productionStore'
import { packagingFromLb } from '../utils/production'
import DatePickerField from '../components/DatePickerField'

const DATE_FORMAT = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })

type Tab = 'gourmet' | 'blend'

export default function ProduccionPage() {
  const navigate = useNavigate()
  const all = useAllProductions()
  const [tab, setTab] = useState<Tab>('gourmet')
  const [diaFiltro, setDiaFiltro] = useState('')

  const list = useMemo(() => all.filter(p => p.type === tab && (!diaFiltro || p.fecha === diaFiltro)), [all, tab, diaFiltro])
  const enProceso = useMemo(() => all.filter(p => p.status === 'en_proceso'), [all])

  const thisMonthLb = useMemo(() => {
    const now = new Date()
    return all
      .filter(p => p.status === 'terminada' && p.finalizedAt && sameMonth(new Date(p.finalizedAt), now))
      .reduce((sum, p) => sum + finishedWeight(p), 0)
  }, [all])

  const totalBlendBags = useMemo(() => {
    return all
      .filter((p): p is Extract<Production, { type: 'blend' }> => p.type === 'blend' && p.status === 'terminada')
      .reduce((sum, p) => sum + p.actualFullBags, 0)
  }, [all])

  const totalGourmetComercialBags = useMemo(() => {
    return all
      .filter((p): p is Extract<Production, { type: 'gourmet' }> => p.type === 'gourmet' && p.status === 'terminada')
      .reduce((sum, p) => sum + packagingFromLb(p.empaqueComercialLb).fullBags, 0)
  }, [all])

  const totalGourmetEspecialBags = useMemo(() => {
    return all
      .filter((p): p is Extract<Production, { type: 'gourmet' }> => p.type === 'gourmet' && p.status === 'terminada')
      .reduce((sum, p) => sum + packagingFromLb(p.empaqueEspecialLb).fullBags, 0)
  }, [all])

  const handleDelete = async (e: React.MouseEvent, p: Production) => {
    e.stopPropagation()
    if (!window.confirm(`¿Eliminar el lote ${p.code}? Todavía no había afectado el inventario.`)) return
    try {
      if (p.type === 'gourmet') await deleteGourmetProduction(p.id)
      else await deleteBlendProduction(p.id)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar el lote.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-black">Producción Go Café</h2>
          <p className="mt-1 text-sm text-stone-500">Gestión de Café Propio</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => navigate('/produccion/gourmet/nueva')}><Coffee size={17} /> Nuevo Gourmet</button>
          <button className="btn-primary" onClick={() => navigate('/produccion/blend/nueva')}><Blend size={17} /> Nuevo Blend</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div><p className="text-sm text-stone-500">Lotes en proceso</p><p className="mt-2 text-3xl font-black text-stone-900">{enProceso.length}</p></div>
            <div className="rounded-xl bg-amber-100 p-3 text-amber-700"><Boxes size={20} /></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div><p className="text-sm text-stone-500">Producido este mes</p><p className="mt-2 text-3xl font-black text-stone-900">{thisMonthLb.toFixed(1)} lb</p></div>
            <div className="rounded-xl bg-amber-100 p-3 text-amber-700"><Coffee size={20} /></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div><p className="text-sm text-stone-500">Bolsas Gourmet Comercial (total)</p><p className="mt-2 text-3xl font-black text-stone-900">{totalGourmetComercialBags}</p></div>
            <div className="rounded-xl bg-amber-100 p-3 text-amber-700"><PackageCheck size={20} /></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div><p className="text-sm text-stone-500">Bolsas Gourmet Especial (total)</p><p className="mt-2 text-3xl font-black text-stone-900">{totalGourmetEspecialBags}</p></div>
            <div className="rounded-xl bg-amber-100 p-3 text-amber-700"><PackageCheck size={20} /></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div><p className="text-sm text-stone-500">Bolsas de Blend (total)</p><p className="mt-2 text-3xl font-black text-stone-900">{totalBlendBags}</p></div>
            <div className="rounded-xl bg-amber-100 p-3 text-amber-700"><PackageCheck size={20} /></div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-3">
          <div className="flex">
            <TabButton active={tab === 'gourmet'} onClick={() => setTab('gourmet')} icon={Coffee} label="Gourmet" />
            <TabButton active={tab === 'blend'} onClick={() => setTab('blend')} icon={Blend} label="Blend" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-44"><DatePickerField value={diaFiltro} onChange={setDiaFiltro} placeholder="Buscar por día" /></div>
            {diaFiltro && <button type="button" className="icon-btn" title="Quitar filtro" onClick={() => setDiaFiltro('')}><X size={16} /></button>}
          </div>
        </div>

        {list.length === 0 && (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 rounded-2xl bg-stone-100 p-4 text-stone-500">{tab === 'gourmet' ? <Coffee size={28} /> : <Blend size={28} />}</div>
            <h3 className="font-bold">{diaFiltro ? `Sin lotes de ${tab === 'gourmet' ? 'Gourmet' : 'Blend'} ese día` : `Aún no hay producciones de ${tab === 'gourmet' ? 'Gourmet' : 'Blend'}`}</h3>
            <p className="mt-1 max-w-md text-sm text-stone-500">{diaFiltro ? 'Prueba con otra fecha o quita el filtro.' : 'Inicia un nuevo lote para comenzar a llevar el control.'}</p>
          </div>
        )}

        {list.length > 0 && (
          <div className="divide-y divide-stone-100">
            {list.map(p => {
              const isFinalized = p.status === 'terminada'
              const editHref = `/produccion/${p.type}/${p.id}/editar`
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="rounded-xl bg-stone-100 p-2.5 text-stone-500">{p.type === 'gourmet' ? <Coffee size={18} /> : <Blend size={18} />}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-stone-900">{p.code}</p>
                    <p className="text-sm text-stone-500">{summaryLine(p)}</p>
                  </div>
                  <span className="hidden shrink-0 text-xs text-stone-400 sm:inline">{DATE_FORMAT.format(new Date(p.fecha || p.createdAt))}</span>
                  <span className={`shrink-0 rounded-lg px-3 py-1 text-xs font-semibold ${isFinalized ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                    {PRODUCTION_STATUS_LABELS[p.status]}
                  </span>
                  {!isFinalized && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" className="icon-btn-danger" title="Eliminar lote" onClick={e => handleDelete(e, p)}><Trash2 size={16} /></button>
                    </div>
                  )}
                  {isFinalized ? (
                    <Link to={`/produccion/${p.id}`} className="btn-secondary shrink-0">Ver detalle</Link>
                  ) : (
                    <Link to={editHref} className="btn-primary shrink-0">Continuar</Link>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: typeof Coffee, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${active ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}`}
    >
      <Icon size={16} /> {label}
    </button>
  )
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function finishedWeight(p: Production): number {
  if (p.type === 'gourmet') return p.empaqueComercialLb + p.empaqueEspecialLb
  return p.molidoMezclaWeightLb
}

function summaryLine(p: Production): string {
  if (p.type === 'gourmet') {
    const roasted = roastedAllocatedLb(p.roasts)
    return p.status === 'terminada'
      ? `${p.empaqueComercialLb.toFixed(1)} lb Comercial + ${p.empaqueEspecialLb.toFixed(1)} lb Especial`
      : `${p.pergaminoUsedLb.toFixed(1)} lb Pergamino · en paso "${p.currentStepName}"${roasted ? ` · ${roasted.toFixed(1)} lb tostadas` : ''}`
  }
  return p.status === 'terminada'
    ? `${p.actualFullBags} bolsas de 350 g (${p.segundaType === 'oro' ? 'Oro' : 'Natural'})`
    : `${p.cantidadPlanificadaLb.toFixed(1)} lb planificadas con ${p.segundaType === 'oro' ? 'Oro' : 'Natural'} · en paso "${p.currentStepName}"`
}
