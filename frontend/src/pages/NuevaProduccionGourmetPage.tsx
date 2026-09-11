import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, Coffee, Loader2, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MAX_ROAST_LB, packagingFromLb, todayISODate } from '../utils/production'
import { GOURMET_STEPS, ROAST_TYPES, ROAST_TYPE_LABELS, gourmetMermaLb, roastedAllocatedLb, type GourmetStep, type RoastBatch, type RoastType } from '../types/production'
import {
  finalizeGourmetProduction,
  startGourmetProduction,
  updateGourmetProduction,
  useGourmetProduction,
  useProductionsLoaded,
} from '../store/productionStore'
import { getRawMaterialStock, useInventory } from '../store/inventoryStore'
import DatePickerField from '../components/DatePickerField'

type RoastForm = { id: number, weightLb: number | '', notes: string }
const emptyRoast = (id: number): RoastForm => ({ id, weightLb: '', notes: '' })
const toRoast = (r: RoastForm): RoastBatch => ({ id: r.id, weightLb: Number(r.weightLb) || 0, notes: r.notes })

export default function NuevaProduccionGourmetPage() {
  const { id } = useParams<{ id?: string }>()
  const productionsReady = useProductionsLoaded()
  // Igual que en NuevaOrdenPage: el formulario precarga sus campos una sola vez (useState
  // perezoso) a partir de "existing", así que no puede montarse hasta que el lote ya esté en caché.
  if (id && !productionsReady) return null
  return <GourmetForm id={id} />
}

function GourmetForm({ id }: { id?: string }) {
  const navigate = useNavigate()
  useInventory() // se re-renderiza cuando cambia el stock de materia prima
  const existing = useGourmetProduction(id)
  const notFound = Boolean(id && !existing)
  const isFinalized = existing?.status === 'terminada'

  const [productionId, setProductionId] = useState<string | null>(existing?.id ?? null)
  const [step, setStep] = useState(() => {
    if (!existing) return 0
    const idx = GOURMET_STEPS.indexOf(existing.currentStepName)
    return idx >= 0 ? idx : 0
  })
  const [pageError, setPageError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isNewDraft = !productionId

  const [fecha, setFecha] = useState(() => existing?.fecha ?? todayISODate())
  const [pergaminoUsedStr, setPergaminoUsedStr] = useState(() => existing ? String(existing.pergaminoUsedLb) : '')

  const [trilladoWeight, setTrilladoWeight] = useState(() => existing?.trilladoWeightLb ? String(existing.trilladoWeightLb) : '')
  const [roastType, setRoastType] = useState<RoastType>(() => existing?.roastType ?? 'medio')
  const [roasts, setRoasts] = useState<RoastForm[]>(() => existing && existing.roasts.length ? existing.roasts : [emptyRoast(1)])
  const [pesoTuesteResult, setPesoTuesteResult] = useState(() => existing?.pesoTuesteResultLb ? String(existing.pesoTuesteResultLb) : '')
  const [reservaCafeteria, setReservaCafeteria] = useState(() => existing?.reservaCafeteriaLb ? String(existing.reservaCafeteriaLb) : '0')
  const [molidoWeight, setMolidoWeight] = useState(() => existing?.molidoWeightLb ? String(existing.molidoWeightLb) : '')
  const [empaqueComercial, setEmpaqueComercial] = useState(() => existing?.empaqueComercialLb ? String(existing.empaqueComercialLb) : '')
  const [empaqueEspecial, setEmpaqueEspecial] = useState(() => existing?.empaqueEspecialLb ? String(existing.empaqueEspecialLb) : '')

  const pergaminoAvailable = getRawMaterialStock('pergamino')
  const pergaminoUsed = Number(pergaminoUsedStr) || 0
  const trilladoLb = Number(trilladoWeight) || 0
  const roastedTotal = useMemo(() => roastedAllocatedLb(roasts.map(toRoast)), [roasts])
  const pesoTuesteResultLb = Number(pesoTuesteResult) || 0
  const reservaLb = Number(reservaCafeteria) || 0
  const restanteParaMolido = Math.max(pesoTuesteResultLb - reservaLb, 0)
  const molidoLb = Number(molidoWeight) || 0
  const comercialLb = Number(empaqueComercial) || 0
  const especialLb = Number(empaqueEspecial) || 0
  const comercialPackaging = useMemo(() => packagingFromLb(comercialLb), [comercialLb])
  const especialPackaging = useMemo(() => packagingFromLb(especialLb), [especialLb])
  const merma = gourmetMermaLb({ pergaminoUsedLb: pergaminoUsed, trilladoWeightLb: trilladoLb, roasts: roasts.map(toRoast), pesoTuesteResultLb, reservaCafeteriaLb: reservaLb, molidoWeightLb: molidoLb })

  const roastValidation = useMemo(() => {
    let allocated = 0
    const errors: Record<number, string> = {}
    for (const r of roasts) {
      const weight = Number(r.weightLb) || 0
      if (weight <= 0) continue
      if (weight > MAX_ROAST_LB) { errors[r.id] = `El máximo permitido por tueste es ${MAX_ROAST_LB} lb.`; continue }
      const pendingBefore = Math.max(trilladoLb - allocated, 0)
      if (weight > pendingBefore) { errors[r.id] = `Solo quedan ${pendingBefore.toFixed(2)} lb pendientes por asignar.`; continue }
      allocated += weight
    }
    return { allocated, remaining: Math.max(trilladoLb - allocated, 0), errors, hasErrors: Object.keys(errors).length > 0 }
  }, [roasts, trilladoLb])
  const roastFullyAllocated = !roastValidation.hasErrors && roastValidation.remaining <= 0 && roastedTotal > 0

  useEffect(() => {
    if (notFound) navigate('/produccion', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notFound])

  useEffect(() => {
    if (isFinalized && productionId) navigate(`/produccion/${productionId}`, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinalized, productionId])

  if (notFound || isFinalized) return null

  const buildPatch = () => ({
    fecha,
    pergaminoUsedLb: pergaminoUsed,
    trilladoWeightLb: trilladoLb,
    roastType,
    roasts: roasts.map(toRoast),
    pesoTuesteResultLb,
    reservaCafeteriaLb: reservaLb,
    molidoWeightLb: molidoLb,
    empaqueComercialLb: comercialLb,
    empaqueEspecialLb: especialLb,
    notas: '',
    currentStepName: GOURMET_STEPS[step],
  })

  // Evita doble-envío: un doble clic antes de que responda el backend podría crear dos lotes.
  const persistNow = async () => {
    if (submitting || !productionId) return
    setSubmitting(true)
    try {
      await updateGourmetProduction(productionId, buildPatch())
    } finally {
      setSubmitting(false)
    }
  }

  const handleStart = async () => {
    setPageError('')
    if (submitting) return
    const usedLb = Number(pergaminoUsedStr) || 0
    if (usedLb <= 0) { setPageError('Ingresa la cantidad de Pergamino que se usará en este lote.'); return }
    if (usedLb > pergaminoAvailable) { setPageError(`Solo hay ${pergaminoAvailable.toFixed(2)} lb de Pergamino disponibles en inventario.`); return }
    setSubmitting(true)
    try {
      const created = await startGourmetProduction({ fecha, pergaminoUsedLb: usedLb, notas: '' })
      setProductionId(created.id)
      navigate(`/produccion/gourmet/${created.id}/editar`, { replace: true })
      setStep(1)
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'No se pudo iniciar la producción.')
    } finally {
      setSubmitting(false)
    }
  }

  const validateStep = (current: GourmetStep): boolean => {
    setPageError('')
    if (current === 'Pergamino') {
      if (pergaminoUsed <= 0) { setPageError('Ingresa la cantidad de Pergamino que se usará en este lote.'); return false }
    }
    if (current === 'Trillado') {
      if (trilladoLb <= 0) { setPageError('Ingresa un peso válido después de trillado.'); return false }
      if (trilladoLb > pergaminoUsed) { setPageError(`No puede superar el Pergamino usado (${pergaminoUsed.toFixed(2)} lb).`); return false }
    }
    if (current === 'Tueste') {
      if (roastValidation.hasErrors) { setPageError('Corrige los pesos inválidos de los tuestes antes de continuar.'); return false }
      if (roastValidation.remaining > 0.001) { setPageError(`Todavía quedan ${roastValidation.remaining.toFixed(2)} lb pendientes de asignar a tuestes.`); return false }
      if (roastedTotal <= 0) { setPageError('Registra el peso de al menos un tueste.'); return false }
      if (pesoTuesteResultLb <= 0) { setPageError('Ingresa el peso después del tueste.'); return false }
      if (pesoTuesteResultLb > roastedTotal) { setPageError(`El peso después del tueste no puede superar las ${roastedTotal.toFixed(2)} lb que entraron al tostador.`); return false }
    }
    if (current === 'Reserva para cafetería') {
      if (reservaLb < 0) { setPageError('La reserva no puede ser negativa.'); return false }
      if (reservaLb > pesoTuesteResultLb) { setPageError(`La reserva no puede superar las ${pesoTuesteResultLb.toFixed(2)} lb obtenidas tras el tueste.`); return false }
    }
    if (current === 'Molido') {
      if (molidoLb <= 0) { setPageError('Ingresa un peso válido después de molido.'); return false }
      if (molidoLb > restanteParaMolido) { setPageError(`No puede superar las ${restanteParaMolido.toFixed(2)} lb disponibles tras la reserva.`); return false }
    }
    if (current === 'Empaque') {
      if (comercialLb < 0 || especialLb < 0) { setPageError('Las libras de empaque no pueden ser negativas.'); return false }
      if (Math.abs(comercialLb + especialLb - molidoLb) > 0.01) { setPageError(`Comercial + Especial debe sumar exactamente ${molidoLb.toFixed(2)} lb (llevas ${(comercialLb + especialLb).toFixed(2)} lb).`); return false }
    }
    return true
  }

  const goNext = async () => {
    setPageError('')
    if (!validateStep(GOURMET_STEPS[step])) return
    try {
      await persistNow()
      setStep(s => Math.min(GOURMET_STEPS.length - 1, s + 1))
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'No se pudo guardar el lote.')
    }
  }
  const goPrev = async () => {
    setPageError('')
    try {
      await persistNow()
      setStep(s => Math.max(0, s - 1))
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'No se pudo guardar el lote.')
    }
  }

  const handleFinalize = async () => {
    if (!validateStep('Empaque')) return
    if (!productionId || submitting) return
    setSubmitting(true)
    try {
      await updateGourmetProduction(productionId, buildPatch())
      await finalizeGourmetProduction(productionId)
      navigate(`/produccion/${productionId}`)
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'No se pudo finalizar la producción.')
    } finally {
      setSubmitting(false)
    }
  }

  const updateRoast = (rid: number, key: keyof RoastForm, value: string) => {
    setPageError('')
    setRoasts(prev => prev.map(r => r.id === rid ? { ...r, [key]: key === 'notes' ? value : (value === '' ? '' : Number(value)) } : r))
  }
  const addRoast = () => {
    setPageError('')
    if (roastValidation.hasErrors) { setPageError('Corrige el peso marcado en rojo antes de agregar otro tueste.'); return }
    if (roastValidation.remaining <= 0) { setPageError('El peso disponible ya fue asignado por completo.'); return }
    setRoasts(prev => [...prev, emptyRoast(prev.length + 1)])
  }
  const removeRoast = (rid: number) => {
    setRoasts(prev => prev.length === 1 ? prev : prev.filter(r => r.id !== rid).map((r, i) => ({ ...r, id: i + 1 })))
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/produccion" className="rounded-xl border border-stone-200 bg-white p-2.5"><ArrowLeft size={18} /></Link>
        <div className="flex-1">
          <h2 className="text-2xl font-black">Producción Gourmet</h2>
        </div>
        <span className="rounded-lg bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-700">Lote {existing?.code ?? 'Se asigna al guardar'}</span>
      </div>

      <div className="card overflow-x-auto p-3">
        <div className="flex min-w-[820px] gap-2">
          {GOURMET_STEPS.map((s, i) => (
            <div
              key={s}
              className={`flex-1 rounded-xl px-3 py-3 text-sm font-semibold ${step === i ? 'bg-stone-900 text-white' : i < step ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500'}`}
            >
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20">{i < step ? <Check size={14} /> : i + 1}</span>{s}
            </div>
          ))}
        </div>
      </div>

      {pageError && (
        <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          <AlertTriangle className="mt-0.5 shrink-0" size={19} /><span>{pageError}</span>
        </div>
      )}

      {GOURMET_STEPS[step] === 'Pergamino' && (
        <section className="card p-6">
          <SectionTitle title="1. Pergamino" subtitle="Café de primera que se usará como base de este lote de Gourmet." />
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Stat label="Pergamino disponible en inventario" value={`${pergaminoAvailable.toFixed(2)} lb`} />
            <Stat label="Fecha del lote" value={fecha} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Fecha"><DatePickerField value={fecha} onChange={setFecha} /></Field>
            <Field label="Pergamino a usar (lb)"><input type="number" min="0" step="0.01" className="input" value={pergaminoUsedStr} onChange={e => { setPageError(''); setPergaminoUsedStr(e.target.value) }} /></Field>
          </div>
          {isNewDraft && (
            <button className="btn-primary mt-5 disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting} onClick={handleStart}>
              {submitting ? <Loader2 size={17} className="animate-spin" /> : <Coffee size={17} />} Confirmar e iniciar producción
            </button>
          )}
        </section>
      )}

      {GOURMET_STEPS[step] === 'Trillado' && (
        <section className="card p-6">
          <SectionTitle title="2. Trillado" subtitle="Peso registrado tras el proceso de trillado." />
          <div className="max-w-md">
            <Field label="Peso después de trillado (lb)">
              <input type="number" min="0" max={pergaminoUsed} step="0.01" className={`input ${trilladoLb > pergaminoUsed && pergaminoUsed > 0 ? '!border-red-400 !bg-red-50' : ''}`} value={trilladoWeight} onChange={e => { setPageError(''); setTrilladoWeight(e.target.value) }} />
            </Field>
            <p className="mt-2 text-sm text-stone-500">Pergamino usado: {pergaminoUsed.toFixed(2)} lb{trilladoLb > 0 ? ` · Merma: ${Math.max(pergaminoUsed - trilladoLb, 0).toFixed(2)} lb` : ''}</p>
          </div>
        </section>
      )}

      {GOURMET_STEPS[step] === 'Tueste' && (
        <section className="space-y-4">
          <div className="card p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Disponible para tostar" value={`${trilladoLb.toFixed(2)} lb`} />
              <Stat label="Asignado a tuestes" value={`${roastValidation.allocated.toFixed(2)} lb`} />
              <Stat label="Pendiente" value={`${roastValidation.remaining.toFixed(2)} lb`} />
            </div>
            {roastFullyAllocated && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">✓ Todo el café disponible ya fue asignado a tuestes. Total tostado: {roastedTotal.toFixed(2)} lb.</div>
            )}
          </div>

          <div className="card p-6">
            <Field label="Tipo de tueste">
              <select className="select max-w-xs" value={roastType} onChange={e => setRoastType(e.target.value as RoastType)}>
                {ROAST_TYPES.map(t => <option key={t} value={t}>{ROAST_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
            <p className="mt-2 text-sm text-stone-500">El café que se reserve para cafetería se guarda por separado según este tipo de tueste.</p>
          </div>

          {roasts.map(r => {
            const err = roastValidation.errors[r.id]
            return (
              <div className="card p-6" key={r.id}>
                <div className="mb-5 flex items-center justify-between">
                  <div><h3 className="font-black">Tueste No. {r.id}</h3><p className="text-sm text-stone-500">Máximo permitido: {MAX_ROAST_LB} lb por servicio.</p></div>
                  <button className="rounded-xl border border-stone-200 p-2 text-stone-500" onClick={() => removeRoast(r.id)}><Trash2 size={17} /></button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Peso (lb)">
                    <input type="number" max={MAX_ROAST_LB} min="0" step="0.01" className={`input ${err ? '!border-red-400 !bg-red-50' : ''}`} value={r.weightLb} onChange={e => updateRoast(r.id, 'weightLb', e.target.value)} />
                    {err && <span className="mt-1.5 block text-xs font-medium text-red-600">{err}</span>}
                  </Field>
                  <Field label="Notas"><input className="input" value={r.notes} onChange={e => updateRoast(r.id, 'notes', e.target.value)} /></Field>
                </div>
              </div>
            )
          })}

          <button className="btn-secondary disabled:cursor-not-allowed disabled:opacity-40" onClick={addRoast} disabled={roastValidation.hasErrors || roastValidation.remaining <= 0}>
            <Plus size={17} /> Agregar tueste
          </button>

          {roastFullyAllocated && (
            <div className="card p-6">
              <SectionTitle title="Peso después del tueste" subtitle="" />
              <div className="max-w-md">
                <Field label="Peso después del tueste (lb)">
                  <input type="number" min="0" max={roastedTotal} step="0.01" className={`input ${pesoTuesteResultLb > roastedTotal ? '!border-red-400 !bg-red-50' : ''}`} value={pesoTuesteResult} onChange={e => { setPageError(''); setPesoTuesteResult(e.target.value) }} />
                </Field>
                <p className="mt-2 text-sm text-stone-500">Peso que entró al tostador: {roastedTotal.toFixed(2)} lb{pesoTuesteResultLb > 0 ? ` · Merma: ${Math.max(roastedTotal - pesoTuesteResultLb, 0).toFixed(2)} lb` : ''}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {GOURMET_STEPS[step] === 'Reserva para cafetería' && (
        <section className="card p-6">
          <SectionTitle title="4. Reserva para cafetería" subtitle="Parte del café tostado puede separarse en grano para abastecer a la Cafeteria." />
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Peso después del tueste" value={`${pesoTuesteResultLb.toFixed(2)} lb`} />
            <Stat label="Tipo de tueste" value={ROAST_TYPE_LABELS[roastType]} />
            <Stat label="Continúa a molido" value={`${restanteParaMolido.toFixed(2)} lb`} />
          </div>
          <div className="max-w-md">
            <Field label="Libras en (Grano) a reservar para cafetería">
              <input type="number" min="0" max={pesoTuesteResultLb} step="0.01" className="input" value={reservaCafeteria} onChange={e => { setPageError(''); setReservaCafeteria(e.target.value) }} />
            </Field>
          </div>
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Estas libras pasarán al inventario de café en grano — Tueste {ROAST_TYPE_LABELS[roastType]} cuando se finalice el lote.</p>
        </section>
      )}

      {GOURMET_STEPS[step] === 'Molido' && (
        <section className="card p-6">
          <SectionTitle title="5. Molido" subtitle="Peso registrado tras el proceso de molido, listo para empaque." />
          <div className="max-w-md">
            <Field label="Peso después de molido (lb)">
              <input type="number" min="0" max={restanteParaMolido} step="0.01" className={`input ${molidoLb > restanteParaMolido && restanteParaMolido > 0 ? '!border-red-400 !bg-red-50' : ''}`} value={molidoWeight} onChange={e => { setPageError(''); setMolidoWeight(e.target.value) }} />
            </Field>
            <p className="mt-2 text-sm text-stone-500">Disponible tras reserva: {restanteParaMolido.toFixed(2)} lb</p>
          </div>
        </section>
      )}

      {GOURMET_STEPS[step] === 'Empaque' && (
        <section className="card p-6">
          <SectionTitle title="6. Empaque" subtitle="Distribuye el peso a empacar a Comercial o Especial. El sistema te dara un total de cuantas bolsas sale y la merma restante." />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Comercial (lb)"><input type="number" min="0" step="0.01" className="input" value={empaqueComercial} onChange={e => { setPageError(''); setEmpaqueComercial(e.target.value) }} /></Field>
            <Field label="Especial (lb)"><input type="number" min="0" step="0.01" className="input" value={empaqueEspecial} onChange={e => { setPageError(''); setEmpaqueEspecial(e.target.value) }} /></Field>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Stat label="Peso a empacar" value={`${molidoLb.toFixed(2)} lb`} />
            <Stat label={Math.abs(comercialLb + especialLb - molidoLb) > 0.01 ? 'Diferencia' : 'Distribuido'} value={`${(comercialLb + especialLb).toFixed(2)} lb`} />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-stone-100 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Bolsas de 350 g — Comercial</p>
              <p className="mt-1 text-xl font-black text-stone-900">{comercialPackaging.fullBags} bolsas{comercialPackaging.remainderGrams > 0 ? ` + ${comercialPackaging.remainderGrams.toFixed(1)} g` : ''}</p>
            </div>
            <div className="rounded-2xl bg-stone-100 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Bolsas de 350 g — Especial</p>
              <p className="mt-1 text-xl font-black text-stone-900">{especialPackaging.fullBags} bolsas{especialPackaging.remainderGrams > 0 ? ` + ${especialPackaging.remainderGrams.toFixed(1)} g` : ''}</p>
            </div>
          </div>
        </section>
      )}

      {GOURMET_STEPS[step] === 'Resumen' && (
        <section className="card p-6">
          <SectionTitle title="7. Resumen del lote" subtitle="Revisa los datos antes de finalizar. Al finalizar se actualiza el inventario." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Pergamino usado" value={`${pergaminoUsed.toFixed(2)} lb`} />
            <Stat label="Después de trillado" value={`${trilladoLb.toFixed(2)} lb`} />
            <Stat label="Tipo de tueste" value={ROAST_TYPE_LABELS[roastType]} />
            <Stat label="Peso después del tueste" value={`${pesoTuesteResultLb.toFixed(2)} lb`} />
            <Stat label="Reserva cafetería" value={`${reservaLb.toFixed(2)} lb`} />
            <Stat label="Después de molido" value={`${molidoLb.toFixed(2)} lb`} />
            <Stat label="Comercial" value={`${comercialLb.toFixed(2)} lb`} />
            <Stat label="Especial" value={`${especialLb.toFixed(2)} lb`} />
            <Stat label="Fecha" value={fecha} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Merma en trillado" value={`${merma.mermaTrillado.toFixed(2)} lb`} />
            <Stat label="Merma en tueste" value={`${merma.mermaTueste.toFixed(2)} lb`} />
            <Stat label="Merma en molido" value={`${merma.mermaMolido.toFixed(2)} lb`} />
            <Stat label="Merma total" value={`${merma.total.toFixed(2)} lb`} />
          </div>
          <button className="btn-primary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting} onClick={handleFinalize}>
            {submitting && <Loader2 size={16} className="animate-spin" />} Finalizar producción
          </button>
        </section>
      )}

      <div className="flex items-center justify-between gap-3">
        <button className="btn-secondary disabled:opacity-40" disabled={step === 0 || submitting} onClick={goPrev}>Anterior</button>
        <button className="btn-secondary disabled:opacity-40" disabled={step === GOURMET_STEPS.length - 1 || (isNewDraft && step === 0) || submitting} onClick={goNext}>Siguiente</button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
function SectionTitle({ title, subtitle }: { title: string, subtitle: string }) {
  return <div className="mb-6"><h3 className="text-lg font-black">{title}</h3><p className="mt-1 text-sm text-stone-500">{subtitle}</p></div>
}
function Stat({ label, value }: { label: string, value: string }) {
  return <div className="rounded-xl bg-stone-100 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-1 text-xl font-black text-stone-900">{value}</p></div>
}
