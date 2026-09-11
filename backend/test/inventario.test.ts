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

describe('GET /api/inventario/stock', () => {
  it('devuelve los 9 materiales en 0 aunque no haya filas todavía (base recién migrada)', async () => {
    const res = await request(app).get('/api/inventario/stock').set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(9)
    expect(res.body.every((s: any) => s.cantidadLb === 0)).toBe(true)
  })
})

describe('POST /api/inventario/materia-prima/:material/entrada', () => {
  it('suma al stock y registra un movimiento de entrada', async () => {
    const res = await request(app).post('/api/inventario/materia-prima/pergamino/entrada').set(authHeader(token)).send({ cantidadLb: 60, motivo: 'Compra inicial' })
    expect(res.status).toBe(204)

    const stock = await request(app).get('/api/inventario/stock').set(authHeader(token))
    expect(stock.body.find((s: any) => s.material === 'pergamino').cantidadLb).toBe(60)

    const movimientos = await request(app).get('/api/inventario/movimientos').set(authHeader(token)).query({ material: 'pergamino' })
    expect(movimientos.body).toHaveLength(1)
    expect(movimientos.body[0].tipo).toBe('entrada')
    expect(movimientos.body[0].motivo).toBe('Compra inicial')
  })

  it('rechaza cantidades <= 0', async () => {
    const res = await request(app).post('/api/inventario/materia-prima/pergamino/entrada').set(authHeader(token)).send({ cantidadLb: 0 })
    expect(res.status).toBe(400)
  })

  it('rechaza un material que no es materia prima', async () => {
    const res = await request(app).post('/api/inventario/materia-prima/blend_bolsas/entrada').set(authHeader(token)).send({ cantidadLb: 10 })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/inventario/materia-prima/:material/salida', () => {
  it('resta del stock y agrega un único movimiento de salida (no reescribe el historial)', async () => {
    await request(app).post('/api/inventario/materia-prima/pergamino/entrada').set(authHeader(token)).send({ cantidadLb: 105 })

    const res = await request(app).post('/api/inventario/materia-prima/pergamino/salida').set(authHeader(token)).send({ cantidadLb: 5, motivo: 'Corrección de captura' })
    expect(res.status).toBe(204)

    const stock = await request(app).get('/api/inventario/stock').set(authHeader(token))
    expect(stock.body.find((s: any) => s.material === 'pergamino').cantidadLb).toBe(100)

    const movimientos = await request(app).get('/api/inventario/movimientos').set(authHeader(token)).query({ material: 'pergamino' })
    // entrada original (105) + una sola salida de corrección (5) = 2, el original nunca se borra ni se edita
    expect(movimientos.body).toHaveLength(2)
    expect(movimientos.body[0].tipo).toBe('salida')
    expect(movimientos.body[0].motivo).toBe('Corrección de captura')
  })

  it('rechaza restar más de lo disponible', async () => {
    const res = await request(app).post('/api/inventario/materia-prima/pergamino/salida').set(authHeader(token)).send({ cantidadLb: 999 })
    expect(res.status).toBe(400)
  })

  it('rechaza cantidades <= 0', async () => {
    const res = await request(app).post('/api/inventario/materia-prima/pergamino/salida').set(authHeader(token)).send({ cantidadLb: 0 })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/inventario/materia-prima/:material/umbral', () => {
  it('actualiza el mínimo y dispara/quita la alerta según corresponda', async () => {
    await request(app).patch('/api/inventario/materia-prima/pergamino/umbral').set(authHeader(token)).send({ minimoLb: 50 })
    await request(app).post('/api/inventario/materia-prima/pergamino/entrada').set(authHeader(token)).send({ cantidadLb: 10 })

    const conAlerta = await request(app).get('/api/inventario/alertas').set(authHeader(token))
    expect(conAlerta.body.some((a: any) => a.material === 'pergamino')).toBe(true)

    await request(app).post('/api/inventario/materia-prima/pergamino/entrada').set(authHeader(token)).send({ cantidadLb: 100 })
    const sinAlerta = await request(app).get('/api/inventario/alertas').set(authHeader(token))
    expect(sinAlerta.body.some((a: any) => a.material === 'pergamino')).toBe(false)
  })
})

describe('salidas de producto terminado / grano reservado', () => {
  it('descuenta grano de cafetería reservado y falla si no alcanza', async () => {
    await prisma.inventarioStock.create({ data: { material: 'grano_medio', cantidadLb: 5 } })

    const ok = await request(app).post('/api/inventario/grano-cafeteria/medio/salida').set(authHeader(token)).send({ cantidadLb: 3, motivo: 'Venta cafetería' })
    expect(ok.status).toBe(204)

    const excede = await request(app).post('/api/inventario/grano-cafeteria/medio/salida').set(authHeader(token)).send({ cantidadLb: 10, motivo: 'Venta cafetería' })
    expect(excede.status).toBe(400)
  })

  it('descuenta gourmet comercial/especial terminado', async () => {
    await prisma.inventarioStock.create({ data: { material: 'gourmet_especial', cantidadLb: 20 } })
    const res = await request(app).post('/api/inventario/gourmet/especial/salida').set(authHeader(token)).send({ cantidadLb: 5, motivo: 'Venta' })
    expect(res.status).toBe(204)
    const stock = await request(app).get('/api/inventario/stock').set(authHeader(token))
    expect(stock.body.find((s: any) => s.material === 'gourmet_especial').cantidadLb).toBe(15)
  })

  it('envía bolsas de blend por unidad completa, no por libras sueltas', async () => {
    // 10 bolsas de 350g exactas
    await prisma.inventarioStock.create({ data: { material: 'blend_bolsas', cantidadLb: (10 * 350) / 453.59237 } })

    const excede = await request(app).post('/api/inventario/blend/salida').set(authHeader(token)).send({ bolsas: 11, motivo: 'Venta' })
    expect(excede.status).toBe(400)

    const ok = await request(app).post('/api/inventario/blend/salida').set(authHeader(token)).send({ bolsas: 4, motivo: 'Venta' })
    expect(ok.status).toBe(204)

    const stock = await request(app).get('/api/inventario/stock').set(authHeader(token))
    const restante = stock.body.find((s: any) => s.material === 'blend_bolsas').cantidadLb
    expect(restante).toBeCloseTo((6 * 350) / 453.59237, 2)
  })
})
