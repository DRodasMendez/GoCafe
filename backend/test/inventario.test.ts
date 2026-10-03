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
  it('devuelve los 8 materiales en 0 aunque no haya filas todavía (base recién migrada)', async () => {
    const res = await request(app).get('/api/inventario/stock').set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(8)
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

  it('envía bolsas de Gourmet por tipo y falla si no hay suficientes de ese tipo', async () => {
    // 10 bolsas llenas (6 Comercial + 4 Especial), sin café suelto.
    await prisma.inventarioStock.create({ data: { material: 'gourmet', cantidadLb: (10 * 350) / 453.59237 } })
    await prisma.inventarioGourmetEmpacado.createMany({ data: [{ tipoBolsa: 'comercial', bolsas: 6 }, { tipoBolsa: 'especial', bolsas: 4 }] })

    const excede = await request(app).post('/api/inventario/gourmet/salida').set(authHeader(token)).send({ tipoBolsa: 'especial', bolsas: 5, motivo: 'Venta' })
    expect(excede.status).toBe(400)

    const ok = await request(app).post('/api/inventario/gourmet/salida').set(authHeader(token)).send({ tipoBolsa: 'comercial', bolsas: 2, motivo: 'Venta' })
    expect(ok.status).toBe(204)

    const empacado = await request(app).get('/api/inventario/gourmet/empacado').set(authHeader(token))
    expect(empacado.body.comercial).toBe(4)
    expect(empacado.body.especial).toBe(4)
    const stock = await request(app).get('/api/inventario/stock').set(authHeader(token))
    expect(stock.body.find((s: any) => s.material === 'gourmet').cantidadLb).toBeCloseTo((8 * 350) / 453.59237, 1)
  })

  it('empacar sobrante: el café suelto pasa a bolsa llena y descuenta la bolsa vacía, sin cambiar las libras', async () => {
    // 2 bolsas llenas + 400 g sueltos (alcanza para 1 bolsa más).
    const totalLb = (2 * 350 + 400) / 453.59237
    await prisma.inventarioStock.create({ data: { material: 'gourmet', cantidadLb: totalLb } })
    await prisma.inventarioGourmetEmpacado.create({ data: { tipoBolsa: 'comercial', bolsas: 2 } })
    await prisma.inventarioEmpaqueStock.create({ data: { tipo: 'especial', cantidad: 3 } })

    const excede = await request(app).post('/api/inventario/gourmet/empacar-sobrante').set(authHeader(token)).send({ tipoBolsa: 'especial', bolsas: 2 })
    expect(excede.status).toBe(400)

    const ok = await request(app).post('/api/inventario/gourmet/empacar-sobrante').set(authHeader(token)).send({ tipoBolsa: 'especial', bolsas: 1 })
    expect(ok.status).toBe(204)

    const empacado = await request(app).get('/api/inventario/gourmet/empacado').set(authHeader(token))
    expect(empacado.body.comercial).toBe(2)
    expect(empacado.body.especial).toBe(1)
    // ~50 g; las libras se guardan con 2 decimales, así que puede variar ±3 g.
    expect(Math.abs(empacado.body.sueltoGramos - 50)).toBeLessThan(3)

    const empaque = await request(app).get('/api/inventario/empaque/stock').set(authHeader(token))
    expect(empaque.body.find((s: any) => s.tipo === 'especial').cantidad).toBe(2)

    const stock = await request(app).get('/api/inventario/stock').set(authHeader(token))
    expect(stock.body.find((s: any) => s.material === 'gourmet').cantidadLb).toBeCloseTo(totalLb, 2)
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

describe('inventario de empaque (bolsas)', () => {
  it('devuelve los 8 tipos en 0 aunque no haya filas todavía', async () => {
    const res = await request(app).get('/api/inventario/empaque/stock').set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(8)
    expect(res.body.every((s: any) => s.cantidad === 0)).toBe(true)
  })

  it('entrada suma al stock y registra el movimiento', async () => {
    const res = await request(app).post('/api/inventario/empaque/transparente/entrada').set(authHeader(token)).send({ cantidad: 100, motivo: 'Compra a proveedor' })
    expect(res.status).toBe(204)

    const stock = await request(app).get('/api/inventario/empaque/stock').set(authHeader(token))
    expect(stock.body.find((s: any) => s.tipo === 'transparente').cantidad).toBe(100)

    const movimientos = await request(app).get('/api/inventario/empaque/movimientos').set(authHeader(token)).query({ tipo: 'transparente' })
    expect(movimientos.body).toHaveLength(1)
    expect(movimientos.body[0].tipo).toBe('entrada')
  })

  it('rechaza un tipo de empaque inválido', async () => {
    const res = await request(app).post('/api/inventario/empaque/no-existe/entrada').set(authHeader(token)).send({ cantidad: 10 })
    expect(res.status).toBe(400)
  })

  it('salida rechaza restar más de lo disponible', async () => {
    await request(app).post('/api/inventario/empaque/comercial/entrada').set(authHeader(token)).send({ cantidad: 5 })
    const res = await request(app).post('/api/inventario/empaque/comercial/salida').set(authHeader(token)).send({ cantidad: 10 })
    expect(res.status).toBe(400)
  })

  it('umbral dispara/quita la alerta según corresponda', async () => {
    const tipo = encodeURIComponent('kraft con válvula')
    await request(app).patch(`/api/inventario/empaque/${tipo}/umbral`).set(authHeader(token)).send({ minimo: 10 })

    const conAlerta = await request(app).get('/api/inventario/empaque/alertas').set(authHeader(token))
    expect(conAlerta.body.some((a: any) => a.tipo === 'kraft con válvula')).toBe(true)

    await request(app).post(`/api/inventario/empaque/${tipo}/entrada`).set(authHeader(token)).send({ cantidad: 50 })
    const sinAlerta = await request(app).get('/api/inventario/empaque/alertas').set(authHeader(token))
    expect(sinAlerta.body.some((a: any) => a.tipo === 'kraft con válvula')).toBe(false)
  })
})
