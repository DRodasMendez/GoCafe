import { clearToken, getToken } from './token'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

interface ApiFetchOptions {
  method?: string
  body?: unknown
  query?: Record<string, string | number | undefined>
}

function buildUrl(path: string, query?: ApiFetchOptions['query']): string {
  const url = new URL(path, API_URL)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.error === 'string') return data.error
  } catch {
    // el body no era JSON — se usa el texto de estado como respaldo
  }
  return `Error ${res.status}: ${res.statusText}`
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    // El servidor no respondió a nivel de red (no está corriendo, puerto equivocado, etc.) —
    // se distingue de un error HTTP normal con status 0 para que quien llame pueda dar un
    // mensaje claro en vez de confundirlo con, por ejemplo, credenciales incorrectas.
    throw new ApiError('No se pudo conectar con el servidor. Verifica que esté corriendo.', 0)
  }

  // Sesión vencida o inválida: se limpia el token para que ProtectedRoute mande a /login.
  if (res.status === 401) clearToken()

  if (!res.ok) throw new ApiError(await extractErrorMessage(res), res.status)

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
