import { Request, Response, NextFunction } from 'express';

export function Catch() {
  return function (
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      req: Request,
      res: Response,
      next: NextFunction,
    ) {
      try {
        await originalMethod.apply(this, [req, res, next]);
      } catch (error) {
        next(error);
      }
    };
  };
}
