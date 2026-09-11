import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { AppError } from '../../errors'
import * as inventarioService from './inventario.service'
import { RAW_MATERIALS, type RawMaterialType } from './inventario.constants'

export const inventarioRouter = Router()

function parseRawMaterial(value: string): RawMaterialType {
  if (!RAW_MATERIALS.includes(value as RawMaterialType)) {
    throw new AppError(`Material inválido: ${value}. Debe ser uno de: ${RAW_MATERIALS.join(', ')}.`)
  }
  return value as RawMaterialType
}

const ROAST_TYPES = ['claro', 'medio', 'oscuro'] as const

inventarioRouter.get(
  '/stock',
  asyncHandler(async (_req, res) => {
    res.json(await inventarioService.getStockSnapshot())
  })
)

inventarioRouter.get(
  '/alertas',
  asyncHandler(async (_req, res) => {
    res.json(await inventarioService.getInventoryAlerts())
  })
)

inventarioRouter.get(
  '/movimientos',
  asyncHandler(async (req, res) => {
    const { material, desde, hasta } = req.query
    res.json(
      await inventarioService.getMovimientos({
        material: typeof material === 'string' ? (material as any) : undefined,
        desde: typeof desde === 'string' ? new Date(desde) : undefined,
        hasta: typeof hasta === 'string' ? new Date(hasta) : undefined,
      })
    )
  })
)

const cantidadMotivoSchema = z.object({ cantidadLb: z.number().positive(), motivo: z.string().default('') })

inventarioRouter.post(
  '/materia-prima/:material/entrada',
  asyncHandler(async (req, res) => {
    const material = parseRawMaterial(req.params.material)
    const { cantidadLb, motivo } = cantidadMotivoSchema.parse(req.body)
    await inventarioService.registrarEntradaMateriaPrima(material, cantidadLb, motivo)
    res.status(204).end()
  })
)

inventarioRouter.post(
  '/materia-prima/:material/salida',
  asyncHandler(async (req, res) => {
    const material = parseRawMaterial(req.params.material)
    const { cantidadLb, motivo } = cantidadMotivoSchema.parse(req.body)
    await inventarioService.registrarSalidaMateriaPrima(material, cantidadLb, motivo)
    res.status(204).end()
  })
)

inventarioRouter.patch(
  '/materia-prima/:material/umbral',
  asyncHandler(async (req, res) => {
    const material = parseRawMaterial(req.params.material)
    const { minimoLb } = z.object({ minimoLb: z.number().min(0) }).parse(req.body)
    await inventarioService.updateUmbral(material, minimoLb)
    res.status(204).end()
  })
)

inventarioRouter.post(
  '/grano-cafeteria/:tipo/salida',
  asyncHandler(async (req, res) => {
    const tipo = req.params.tipo
    if (!ROAST_TYPES.includes(tipo as any)) throw new AppError(`Tueste inválido: ${tipo}.`)
    const { cantidadLb, motivo } = cantidadMotivoSchema.parse(req.body)
    await inventarioService.descontarGranoCafeteria(`grano_${tipo}` as any, cantidadLb, motivo)
    res.status(204).end()
  })
)

inventarioRouter.post(
  '/gourmet/:tipo/salida',
  asyncHandler(async (req, res) => {
    const tipo = req.params.tipo === 'comercial' ? 'gourmet_comercial' : req.params.tipo === 'especial' ? 'gourmet_especial' : null
    if (!tipo) throw new AppError('Tipo inválido: usa "comercial" o "especial".')
    const { cantidadLb, motivo } = cantidadMotivoSchema.parse(req.body)
    await inventarioService.descontarGourmetTerminado(tipo, cantidadLb, motivo)
    res.status(204).end()
  })
)

inventarioRouter.post(
  '/blend/salida',
  asyncHandler(async (req, res) => {
    const { bolsas, motivo } = z.object({ bolsas: z.number().int().positive(), motivo: z.string().default('') }).parse(req.body)
    await inventarioService.enviarBlendTerminado(bolsas, motivo)
    res.status(204).end()
  })
)
