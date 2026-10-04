import { NextFunction, Request, Response } from 'express';

export class RequiredBodyMiddleware {
  static create(excludedPaths: string[] = []) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (
        req.method === 'GET' ||
        req.method === 'DELETE' ||
        excludedPaths.includes(req.path)
      ) {
        return next();
      }

      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: 'Request body is required.' });
      }

      next();
    };
  }
}
