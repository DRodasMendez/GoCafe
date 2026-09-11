# Go Café

Sistema de producción de Go Café: control de materia prima, órdenes de clientes, producción propia (Gourmet/Blend) e inventario.

- `frontend/` — React + Vite + TypeScript.
- `backend/` — API en Express + TypeScript + Prisma (PostgreSQL).
- `docker-compose.yml` — levanta Postgres, para no tener que instalarlo a mano.

## Requisitos (una sola vez por máquina)
- [Node.js 20+](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (solo se usa para la base de datos)

No se necesita instalar Postgres, ni ninguna librería del sistema por separado — todo lo demás lo resuelve `npm install` en cada carpeta.

## Puesta en marcha

```bash
git clone <url-del-repo>
cd proyectoA

# 1) Base de datos
cp .env.example .env
docker compose up -d

# 2) Backend
cd backend
cp .env.example .env
# Abre .env y define JWT_SECRET, SEED_USERNAME y SEED_PASSWORD (elige tú los valores, no los compartas por chat).
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev            # http://localhost:4000

# 3) Frontend (en otra terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Con eso, `docker compose down` apaga la base de datos (los datos quedan guardados en un volumen; `docker compose down -v` sí los borra).

## Por qué así, y no de otra forma
- **Docker solo para Postgres**: es la única pieza que, si no se dockeriza, obliga a instalar y versionar a mano un motor de base de datos en cada máquina. El backend y el frontend corren nativos con `npm run dev` porque así el hot-reload es más rápido, sobre todo en Windows.
- **`package-lock.json` va commiteado** en ambos proyectos — usa `npm ci` en vez de `npm install` si quieres una instalación estrictamente igual a la del lockfile (por ejemplo en CI).
- **Nunca subas tu `.env`** — cada quien copia `.env.example` y pone sus propios valores. Lo único compartido entre ustedes dos debe acordarse por fuera del repo (no por chat de IA ni por commit).

## Estado del modelo de datos
El esquema completo vive en `backend/prisma/schema.prisma`. Cubre: clientes, órdenes, producción (Gourmet y Blend, con sus tuestes), inventario (stock, umbrales, Kardex) y un único usuario administrador. Ver `backend/README.md` para el detalle de cada módulo de la API.
