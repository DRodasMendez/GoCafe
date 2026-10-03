import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { resetDb, disconnectDb } from './helpers/db'
import { request, app, createAdminAndLogin, authHeader } from './helpers/testApp'

let token: string

beforeEach(async () => {
  await resetDb()
  token = await createAdminAndLogin()
})
afterAll(disconnectDb)

async function setStock(material: string, cantidadLb: number) {
  await prisma.inventarioStock.upsert({ where: { material }, create: { material, cantidadLb }, update: { cantidadLb } })
}

async function setEmpaqueStock(tipo: string, cantidad: number) {
  await prisma.inventarioEmpaqueStock.upsert({ where: { tipo }, create: { tipo, cantidad }, update: { cantidad } })
}

describe('GET /api/produccion/blend/validar-plan', () => {
  it('calcula 35% pergamino / 65% segunda y marca isValid según el stock', async () => {
    await setStock('pergamino', 100)
    await setStock('oro', 100)
    const res = await request(app).get('/api/produccion/blend/validar-plan').set(authHeader(token)).query({ cantidadLb: 100, segundaType: 'oro' })
    expect(res.status).toBe(200)
    expect(res.body.pergaminoLb).toBeCloseTo(35, 2)
    expect(res.body.segundaLb).toBeCloseTo(65, 2)
    expect(res.body.isValid).toBe(true)
  })

  it('marca isValid en false y reporta el faltante cuando no alcanza el stock', async () => {
    await setStock('pergamino', 10)
    await setStock('natural', 10)
    const res = await request(app).get('/api/produccion/blend/validar-plan').set(authHeader(token)).query({ cantidadLb: 100, segundaType: 'natural' })
    expect(res.body.isValid).toBe(false)
    expect(res.body.pergaminoFaltante).toBeCloseTo(25, 2) // 35 - 10
    expect(res.body.segundaFaltante).toBeCloseTo(55, 2) // 65 - 10
  })
})

describe('POST /api/produccion/blend', () => {
  it('rechaza iniciar el lote si el inventario no alcanza', async () => {
    await setStock('pergamino', 5)
    await setStock('oro', 5)
    const res = await request(app).post('/api/produccion/blend').set(authHeader(token)).send({ fecha: '2026-01-01', cantidadPlanificadaLb: 100, segundaType: 'oro', notas: '' })
    expect(res.status).toBe(400)
  })

  it('crea el lote con code GB-0001 y las cantidades de materia prima calculadas', async () => {
    await setStock('pergamino', 100)
    await setStock('oro', 100)
    const res = await request(app).post('/api/produccion/blend').set(authHeader(token)).send({ fecha: '2026-01-01', cantidadPlanificadaLb: 100, segundaType: 'oro', notas: '' })
    expect(res.status).toBe(201)
    expect(res.body.code).toBe('GB-0001')
    expect(Number(res.body.pergaminoUsedLb)).toBeCloseTo(35, 2)
    expect(Number(res.body.segundaUsedLb)).toBeCloseTo(65, 2)
  })
})

describe('POST /api/produccion/blend/:id/finalizar', () => {
  async function startLote() {
    await setStock('pergamino', 100)
    await setStock('oro', 100)
    const res = await request(app).post('/api/produccion/blend').set(authHeader(token)).send({ fecha: '2026-01-01', cantidadPlanificadaLb: 100, segundaType: 'oro', notas: '' })
    return res.body.id as string
  }

  it('descuenta pergamino + segunda y agrega bolsas de blend terminado', async () => {
    const id = await startLote()
    await setEmpaqueStock('comercial', 10)
    await request(app).patch(`/api/produccion/blend/${id}`).set(authHeader(token)).send({ actualFullBags: 10, actualRemainderGrams: 0 })

    const res = await request(app).post(`/api/produccion/blend/${id}/finalizar`).set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('terminada')

    const stock = await request(app).get('/api/inventario/stock').set(authHeader(token))
    const byMaterial = Object.fromEntries(stock.body.map((s: any) => [s.material, s.cantidadLb]))
    expect(byMaterial.pergamino).toBeCloseTo(65, 2) // 100 - 35
    expect(byMaterial.oro).toBeCloseTo(35, 2) // 100 - 65
    // 10 bolsas de 350g -> ~7.72 lb
    expect(byMaterial.blend_bolsas).toBeCloseTo((10 * 350) / 453.59237, 2)
  })

  it('descuenta del tipo de bolsa elegido ("especial"), no del otro', async () => {
    const id = await startLote()
    await setEmpaqueStock('comercial', 1) // no debe tocarse
    await setEmpaqueStock('especial', 10)
    await request(app).patch(`/api/produccion/blend/${id}`).set(authHeader(token)).send({ actualFullBags: 10, actualRemainderGrams: 0, bagType: 'especial' })

    const res = await request(app).post(`/api/produccion/blend/${id}/finalizar`).set(authHeader(token))
    expect(res.status).toBe(200)

    const empaque = await request(app).get('/api/inventario/empaque/stock').set(authHeader(token))
    const byTipo = Object.fromEntries(empaque.body.map((s: any) => [s.tipo, s.cantidad]))
    expect(byTipo.especial).toBe(0)
    expect(byTipo.comercial).toBe(1)
  })

  it('falla al finalizar si no hay suficientes bolsas del tipo elegido', async () => {
    const id = await startLote()
    await setEmpaqueStock('comercial', 2)
    await request(app).patch(`/api/produccion/blend/${id}`).set(authHeader(token)).send({ actualFullBags: 10, actualRemainderGrams: 0 })

    const res = await request(app).post(`/api/produccion/blend/${id}/finalizar`).set(authHeader(token))
    expect(res.status).toBe(400)
  })

  it('falla si falta pergamino o la segunda al momento de finalizar, y no aplica ningún movimiento', async () => {
    const id = await startLote()
    await setStock('oro', 0) // alguien más se lo llevó mientras el lote estaba en proceso

    const res = await request(app).post(`/api/produccion/blend/${id}/finalizar`).set(authHeader(token))
    expect(res.status).toBe(400)

    const stock = await request(app).get('/api/inventario/stock').set(authHeader(token))
    const pergamino = stock.body.find((s: any) => s.material === 'pergamino')
    expect(pergamino.cantidadLb).toBe(100) // no se tocó nada
  })

  it('dos "finalizar" simultáneos: solo uno se aplica y el inventario se descuenta una sola vez', async () => {
    const id = await startLote()
    const [a, b] = await Promise.all([
      request(app).post(`/api/produccion/blend/${id}/finalizar`).set(authHeader(token)),
      request(app).post(`/api/produccion/blend/${id}/finalizar`).set(authHeader(token)),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 400])
    const stock = await prisma.inventarioStock.findUnique({ where: { material: 'pergamino' } })
    expect(stock?.cantidadLb.toNumber()).toBe(65) // 100 - 35, una sola vez
  })

  it('no permite modificar ni borrar un lote ya finalizado', async () => {
    const id = await startLote()
    await request(app).post(`/api/produccion/blend/${id}/finalizar`).set(authHeader(token))
    const patch = await request(app).patch(`/api/produccion/blend/${id}`).set(authHeader(token)).send({ bagType: 'especial' })
    expect(patch.status).toBe(400)
    const del = await request(app).delete(`/api/produccion/blend/${id}`).set(authHeader(token))
    expect(del.status).toBe(400)
  })

  it('no permite finalizar dos veces', async () => {
    const id = await startLote()
    await request(app).post(`/api/produccion/blend/${id}/finalizar`).set(authHeader(token))
    const segunda = await request(app).post(`/api/produccion/blend/${id}/finalizar`).set(authHeader(token))
    expect(segunda.status).toBe(400)
  })
})
