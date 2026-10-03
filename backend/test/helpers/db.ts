import { prisma } from '../../src/lib/prisma'

/** Todas las tablas de datos del esquema — el orden no importa porque usamos CASCADE. */
const TABLES = [
  'orden_tuestes',
  'ordenes',
  'clientes',
  'producciones_gourmet_tuestes',
  'producciones_gourmet',
  'producciones_blend_tuestes',
  'producciones_blend',
  'inventario_movimientos',
  'inventario_stock',
  'inventario_empaque_movimientos',
  'inventario_empaque_stock',
  'inventario_gourmet_empacado',
  'configuracion',
  'usuarios',
]

/** Deja la base de test como recién migrada: vacía y con los contadores (seq de folios) en 1. */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`)
}

export async function disconnectDb() {
  await prisma.$disconnect()
}
