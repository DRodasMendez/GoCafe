import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import * as produccionService from './produccion.service'

export const produccionRouter = Router()

const roastBatchSchema = z.object({ weightLb: z.number(), notes: z.string().default('') })
const isoDateString = z.string().refine(v => !isNaN(new Date(v).getTime()), { message: 'Fecha inválida.' })

// ---------------------------------------------------------------------------
// Gourmet
// ---------------------------------------------------------------------------

const startGourmetSchema = z.object({
  fecha: isoDateString,
  pergaminoUsedLb: z.number().positive(),
  notas: z.string().default(''),
})

const updateGourmetSchema = z.object({
  fecha: isoDateString.optional(),
  currentStepName: z.string().optional(),
  trilladoWeightLb: z.number().optional(),
  roastType: z.enum(['claro', 'medio', 'oscuro']).optional(),
  roasts: z.array(roastBatchSchema).optional(),
  pesoTuesteResultLb: z.number().optional(),
  reservaCafeteriaLb: z.number().optional(),
  molidoWeightLb: z.number().optional(),
  empaqueComercialLb: z.number().optional(),
  empaqueEspecialLb: z.number().optional(),
  notas: z.string().optional(),
})

produccionRouter.get(
  '/gourmet',
  asyncHandler(async (_req, res) => res.json(await produccionService.listGourmetProductions()))
)

produccionRouter.get(
  '/gourmet/:id',
  asyncHandler(async (req, res) => res.json(await produccionService.getGourmetProduction(req.params.id)))
)

produccionRouter.post(
  '/gourmet',
  asyncHandler(async (req, res) => {
    const input = startGourmetSchema.parse(req.body)
    res.status(201).json(await produccionService.startGourmetProduction(input))
  })
)

produccionRouter.patch(
  '/gourmet/:id',
  asyncHandler(async (req, res) => {
    const patch = updateGourmetSchema.parse(req.body)
    res.json(await produccionService.updateGourmetProduction(req.params.id, patch))
  })
)

produccionRouter.post(
  '/gourmet/:id/finalizar',
  asyncHandler(async (req, res) => res.json(await produccionService.finalizeGourmetProduction(req.params.id)))
)

produccionRouter.delete(
  '/gourmet/:id',
  asyncHandler(async (req, res) => {
    await produccionService.deleteGourmetProduction(req.params.id)
    res.status(204).end()
  })
)

// ---------------------------------------------------------------------------
// Blend
// ---------------------------------------------------------------------------

const startBlendSchema = z.object({
  fecha: isoDateString,
  cantidadPlanificadaLb: z.number().positive(),
  segundaType: z.enum(['oro', 'natural']),
  notas: z.string().default(''),
})

const updateBlendSchema = z.object({
  fecha: isoDateString.optional(),
  currentStepName: z.string().optional(),
  trilladoWeightLb: z.number().optional(),
  roasts: z.array(roastBatchSchema).optional(),
  pesoTuesteResultLb: z.number().optional(),
  molidoMezclaWeightLb: z.number().optional(),
  actualFullBags: z.number().int().optional(),
  actualRemainderGrams: z.number().optional(),
  notas: z.string().optional(),
})

produccionRouter.get(
  '/blend/validar-plan',
  asyncHandler(async (req, res) => {
    const { cantidadLb, segundaType } = z
      .object({ cantidadLb: z.coerce.number().positive(), segundaType: z.enum(['oro', 'natural']) })
      .parse(req.query)
    res.json(await produccionService.validateBlendPlan(cantidadLb, segundaType))
  })
)

produccionRouter.get(
  '/blend',
  asyncHandler(async (_req, res) => res.json(await produccionService.listBlendProductions()))
)

produccionRouter.get(
  '/blend/:id',
  asyncHandler(async (req, res) => res.json(await produccionService.getBlendProduction(req.params.id)))
)

produccionRouter.post(
  '/blend',
  asyncHandler(async (req, res) => {
    const input = startBlendSchema.parse(req.body)
    res.status(201).json(await produccionService.startBlendProduction(input))
  })
)

produccionRouter.patch(
  '/blend/:id',
  asyncHandler(async (req, res) => {
    const patch = updateBlendSchema.parse(req.body)
    res.json(await produccionService.updateBlendProduction(req.params.id, patch))
  })
)

produccionRouter.post(
  '/blend/:id/finalizar',
  asyncHandler(async (req, res) => res.json(await produccionService.finalizeBlendProduction(req.params.id)))
)

produccionRouter.delete(
  '/blend/:id',
  asyncHandler(async (req, res) => {
    await produccionService.deleteBlendProduction(req.params.id)
    res.status(204).end()
  })
)
