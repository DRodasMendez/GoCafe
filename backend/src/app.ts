import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { env } from './env'
import { authRouter } from './modules/auth/auth.routes'
import { clientesRouter } from './modules/clientes/clientes.routes'
import { ordenesRouter } from './modules/ordenes/ordenes.routes'
import { produccionRouter } from './modules/produccion/produccion.routes'
import { inventarioRouter } from './modules/inventario/inventario.routes'
import { requireAuth } from './middleware/auth'
import { notFoundHandler, errorHandler } from './middleware/errorHandler'

export const app = express()

app.use(cors({ origin: env.corsOrigin }))
app.use(express.json())
app.use(morgan('dev'))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/api/auth', authRouter)

// Todo lo demás requiere sesión iniciada (un solo usuario administrador).
app.use('/api/clientes', requireAuth, clientesRouter)
app.use('/api/ordenes', requireAuth, ordenesRouter)
app.use('/api/produccion', requireAuth, produccionRouter)
app.use('/api/inventario', requireAuth, inventarioRouter)

app.use(notFoundHandler)
app.use(errorHandler)
