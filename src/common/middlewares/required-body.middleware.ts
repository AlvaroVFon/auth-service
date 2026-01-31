import { NextFunction, Request, Response } from 'express';

export class RequiredBodyMiddleware {
  static initialize(req: Request, res: Response, next: NextFunction) {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return next();
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: 'Request body is required.' });
    }

    next();
  }
}
