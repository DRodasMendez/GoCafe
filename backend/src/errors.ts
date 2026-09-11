/** Error de negocio esperado (stock insuficiente, dato inválido, etc.) — se responde 400 con su mensaje, a diferencia de un error inesperado (500). */
export class AppError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'No encontrado.') {
    super(message, 404)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado.') {
    super(message, 401)
  }
}
