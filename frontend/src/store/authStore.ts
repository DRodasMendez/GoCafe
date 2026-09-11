import { useSyncExternalStore } from 'react'
import { ApiError, apiFetch } from '../api/client'
import { clearToken, getToken, setToken, subscribeToken } from '../api/token'

export function subscribe(listener: () => void) {
  return subscribeToken(listener)
}

export function isAuthenticated(): boolean {
  return getToken() !== null
}

export function useAuth(): boolean {
  return useSyncExternalStore(subscribe, isAuthenticated)
}

interface LoginResponse {
  token: string
  usuario: { id: string; username: string }
}

/**
 * Intenta iniciar sesión contra el backend. Devuelve true si las credenciales son correctas,
 * false si son incorrectas (401), y relanza cualquier otro error (backend caído, red, etc.)
 * para que la pantalla de login pueda mostrar un mensaje distinto a "credenciales incorrectas".
 */
export async function login(username: string, password: string): Promise<boolean> {
  try {
    const result = await apiFetch<LoginResponse>('/api/auth/login', { method: 'POST', body: { username, password } })
    setToken(result.token)
    return true
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return false
    throw err
  }
}

export function logout(): void {
  clearToken()
}
