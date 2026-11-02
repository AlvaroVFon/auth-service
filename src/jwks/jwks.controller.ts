import type { Request, Response } from 'express';

import type { JwkPublicKey } from '../libs/jwt';

export class JwksController {
  constructor(private readonly getJwks: () => JwkPublicKey[]) {}

  show = (_req: Request, res: Response): void => {
    res.set('Cache-Control', 'public, max-age=300');
    res.status(200).json({ keys: this.getJwks() });
  };
}
