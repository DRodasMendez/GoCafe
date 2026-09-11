import { prisma } from '../../lib/prisma'
import { NotFoundError } from '../../errors'

export function listClientes() {
  return prisma.cliente.findMany({ orderBy: { updatedAt: 'desc' } })
}

export async function getClienteConOrdenes(id: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: { ordenes: { orderBy: { createdAt: 'desc' }, include: { roasts: { orderBy: { seq: 'asc' } } } } },
  })
  if (!cliente) throw new NotFoundError('Cliente no encontrado.')
  return cliente
}

export function createCliente(input: { nombre: string; ciudad: string; telefono: string }) {
  return prisma.cliente.create({ data: input })
}

export async function updateCliente(id: string, patch: Partial<{ nombre: string; ciudad: string; telefono: string }>) {
  const exists = await prisma.cliente.findUnique({ where: { id } })
  if (!exists) throw new NotFoundError('Cliente no encontrado.')
  return prisma.cliente.update({ where: { id }, data: patch })
}

/** Borra el cliente y, en cascada (definida en el esquema), todas sus órdenes — mismo comportamiento que tenía la versión local. */
export async function deleteCliente(id: string) {
  const exists = await prisma.cliente.findUnique({ where: { id } })
  if (!exists) throw new NotFoundError('Cliente no encontrado.')
  await prisma.cliente.delete({ where: { id } })
}
