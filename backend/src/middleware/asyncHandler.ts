import type { NextFunction, Request, Response } from 'express'

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>

/** Envuelve un controlador async para que cualquier rechazo de promesa llegue al errorHandler, sin try/catch repetido en cada ruta. */
export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next)
  }
}
