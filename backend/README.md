# GoCafe Backend

API en Express + TypeScript + Prisma (PostgreSQL) para el sistema de producción de Go Café.

## Requisitos
- Node.js 20+
- Postgres corriendo (ver `docker-compose.yml` en la raíz del repo)

## Configuración inicial
```bash
cp .env.example .env
# Edita .env: define JWT_SECRET, y SEED_USERNAME/SEED_PASSWORD para el único usuario admin.

npm install
npx prisma migrate dev --name init   # crea las tablas
npm run seed                         # crea el usuario admin + inicializa el inventario en 0
npm run dev                          # http://localhost:4000
```

## Módulos
- `auth` — login (usuario único) y validación de sesión (JWT).
- `clientes` — CRUD de clientes.
- `ordenes` — pedidos de café de clientes (folio `GC-0001`, generado a partir de un contador atómico de Postgres, nunca guardado como texto).
- `produccion` — lotes de producción propia de Go Café: Gourmet (`GG-0001`) y Blend (`GB-0001`). El inventario solo se mueve al finalizar un lote, dentro de una transacción (si algo falla a la mitad, no queda un descuento aplicado sin su contraparte).
- `inventario` — stock por material, umbrales de materia prima, alertas y el Kardex (`inventario_movimientos`). El Kardex es de solo-inserción: una corrección de materia prima (ej. se capturó de más) es un movimiento de salida nuevo con su propio motivo, nunca se reescribe una fila pasada.

## Diferencias a propósito respecto al prototipo con localStorage
- Los folios (`GC-`, `GG-`, `GB-`) usan un contador autoincremental de Postgres en vez de leer-y-escribir un número a mano — elimina el riesgo de folios duplicados.
- Los descuentos de materia prima + altas de producto terminado de un lote van en una sola transacción de base de datos.
- El Kardex nunca se edita en el lugar; las correcciones quedan como movimientos nuevos.
- `clientName`/`phone`/`city` ya no se duplican dentro de cada orden — se obtienen por `JOIN` contra `clientes`.

## Scripts
| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga en caliente |
| `npm run build` / `npm start` | Compila a `dist/` y lo corre |
| `npx prisma studio` | Explorador visual de la base de datos |
| `npx prisma migrate dev --name <algo>` | Crea una migración nueva tras editar `schema.prisma` |
| `npm run seed` | Crea/actualiza el usuario admin y las filas base de inventario |
| `npm test` | Corre toda la suite de tests (Vitest + Supertest) contra una base de datos separada |
| `npm run test:watch` | Igual, pero en modo watch |
| `npm run test:typecheck` | Chequea los tipos de `src/` y `test/` juntos (el build normal solo incluye `src/`) |

## Tests

Los tests son de integración: levantan la app de Express en memoria (`supertest`, sin abrir un puerto) y pegan contra una base de datos Postgres real — **nunca** la de desarrollo.

Antes de correrlos, una sola vez por máquina:
```bash
cp .env.test.example .env.test
# crea la base de datos de test (usa el mismo Postgres del docker-compose de la raíz)
docker exec proyectoa-db-1 psql -U gocafe -d postgres -c "CREATE DATABASE gocafe_test OWNER gocafe;"
DATABASE_URL="postgresql://gocafe:gocafe@localhost:5433/gocafe_test?schema=public" npx prisma migrate deploy
```
Después de eso, `npm test` funciona sin nada más — cada test limpia (`TRUNCATE ... RESTART IDENTITY`) la base de test antes de correr, así que el orden no importa y los folios (`GC-0001`, etc.) son deterministas. Cuando el esquema cambie, hay que volver a correr el `prisma migrate deploy` de arriba apuntando a `gocafe_test`.
