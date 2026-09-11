import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import * as ordenesService from './ordenes.service'
import { PACKAGE_TYPES } from './ordenes.constants'

export const ordenesRouter = Router()

const roastSchema = z.object({
  weightLb: z.number(),
  initialTemp: z.number(),
  returnTemp: z.number(),
  returnTime: z.string(),
  dehydrationTemp: z.number(),
  dehydrationTime: z.string(),
  caramelizationTemp: z.number(),
  caramelizationTime: z.string(),
  crackTemp: z.number(),
  crackTime: z.string(),
  finalTemp: z.number(),
  finalTime: z.string(),
  notes: z.string().default(''),
})

const packageAllocationSchema = z.record(z.enum(PACKAGE_TYPES), z.number().int().min(0))

const isoDateString = z.string().refine(v => !isNaN(new Date(v).getTime()), { message: 'Fecha inválida.' })

const createOrdenSchema = z.object({
  clienteId: z.string().uuid(),
  receivedDate: isoDateString,
  estimatedDate: isoDateString,
  coffeeType: z.enum(['pergamino', 'natural', 'oro']),
  initialWeight: z.number().positive(),
  humidity: z.number().min(0).max(100),
  cleaningWeight: z.number().optional(),
  threshingWeight: z.number().optional(),
  roasts: z.array(roastSchema).optional(),
  finalWeight: z.number().optional(),
  roastType: z.string(),
  grindType: z.string(),
  totalPrice: z.number().optional(),
  actualFullBags: z.number().int().optional(),
  actualRemainderGrams: z.number().optional(),
  packageAllocation: packageAllocationSchema,
  incompletePackageType: z.enum(PACKAGE_TYPES),
  currentStepName: z.string(),
})

const updateOrdenSchema = createOrdenSchema.omit({ clienteId: true }).partial().extend({
  pagado: z.boolean().optional(),
})

ordenesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const clienteId = typeof req.query.clienteId === 'string' ? req.query.clienteId : undefined
    res.json(await ordenesService.listOrdenes({ clienteId }))
  })
)

ordenesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => res.json(await ordenesService.getOrden(req.params.id)))
)

ordenesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createOrdenSchema.parse(req.body)
    res.status(201).json(await ordenesService.createOrden(input))
  })
)

ordenesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const patch = updateOrdenSchema.parse(req.body)
    res.json(await ordenesService.updateOrden(req.params.id, patch))
  })
)

ordenesRouter.post(
  '/:id/finalizar',
  asyncHandler(async (req, res) => res.json(await ordenesService.finalizeOrden(req.params.id)))
)

ordenesRouter.patch(
  '/:id/pagado',
  asyncHandler(async (req, res) => {
    const { pagado } = z.object({ pagado: z.boolean() }).parse(req.body)
    res.json(await ordenesService.setOrdenPagado(req.params.id, pagado))
  })
)

ordenesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await ordenesService.deleteOrden(req.params.id)
    res.status(204).end()
  })
)
