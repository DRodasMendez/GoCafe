import { PrismaClient } from '@prisma/client'

// Reutiliza la misma instancia entre recargas de "tsx watch" en desarrollo,
// para no ir abriendo un pool de conexiones nuevo en cada guardado de archivo.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

export const prisma = global.__prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}
