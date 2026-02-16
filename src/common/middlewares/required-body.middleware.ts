import { NextFunction, Request, Response } from 'express';

const EXCLUDED_PATHS = ['/auth/logout'];

export class RequiredBodyMiddleware {
  static initialize(req: Request, res: Response, next: NextFunction) {
    if (
      req.method === 'GET' ||
      req.method === 'DELETE' ||
      EXCLUDED_PATHS.includes(req.path)
    ) {
      return next();
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: 'Request body is required.' });
    }

    next();
  }
}
