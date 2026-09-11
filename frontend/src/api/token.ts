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

let token: string | null = loadToken()

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === TOKEN_KEY) {
      token = loadToken()
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
  listeners.forEach(l => l())
}

export function clearToken(): void {
  token = null
  localStorage.removeItem(TOKEN_KEY)
  listeners.forEach(l => l())
}
