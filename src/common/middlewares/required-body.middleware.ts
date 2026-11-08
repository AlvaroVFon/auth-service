import { NextFunction, Request, Response } from 'express';

/** Exact path or pattern of a route that takes no request body. */
export type BodylessPath = string | RegExp;

const matches = (path: BodylessPath, requestPath: string): boolean =>
  typeof path === 'string' ? path === requestPath : path.test(requestPath);

export class RequiredBodyMiddleware {
  static create(excludedPaths: BodylessPath[] = []) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (
        req.method === 'GET' ||
        req.method === 'DELETE' ||
        excludedPaths.some((path) => matches(path, req.path))
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
