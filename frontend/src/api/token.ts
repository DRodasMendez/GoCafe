// Guarda el JWT de sesión, separado de authStore.ts para que el cliente HTTP (client.ts)
// pueda leerlo/limpiarlo sin crear un import circular con el store que lo usa para login().
const TOKEN_KEY = 'gocafe.auth.token.v1'

type Listener = () => void
const listeners = new Set<Listener>()

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/** Momento de vencimiento del JWT (claim "exp", en ms), o null si no se puede leer. Solo se lee, no se verifica: la verificación real la hace el backend. */
function tokenExpiresAt(t: string): number | null {
  try {
    const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

let expiryTimer: ReturnType<typeof setTimeout> | undefined

/** Cierra la sesión justo cuando vence el token, en vez de esperar a que falle la siguiente petición. */
function scheduleExpiry(t: string | null) {
  clearTimeout(expiryTimer)
  if (!t) return
  const expiresAt = tokenExpiresAt(t)
  if (expiresAt !== null) expiryTimer = setTimeout(clearToken, Math.max(0, expiresAt - Date.now()))
}

let token: string | null = loadToken()
if (token && (tokenExpiresAt(token) ?? Infinity) <= Date.now()) {
  token = null
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* sin acceso a localStorage */ }
}
scheduleExpiry(token)

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === TOKEN_KEY) {
      token = loadToken()
      scheduleExpiry(token)
      listeners.forEach(l => l())
    }
  })
}

export function subscribeToken(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getToken(): string | null {
  return token
}

export function setToken(next: string): void {
  token = next
  localStorage.setItem(TOKEN_KEY, next)
  scheduleExpiry(next)
  listeners.forEach(l => l())
}

export function clearToken(): void {
  token = null
  localStorage.removeItem(TOKEN_KEY)
  scheduleExpiry(null)
  listeners.forEach(l => l())
}
