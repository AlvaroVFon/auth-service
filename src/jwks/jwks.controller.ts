import type { Request, Response } from 'express';

import type { JwkPublicKey, JwtKeyringStatus } from '../libs/jwt';

export class JwksController {
  constructor(
    private readonly getJwks: () => JwkPublicKey[],
    private readonly getKeyStatus: () => JwtKeyringStatus,
  ) {}

  show = (_req: Request, res: Response): void => {
    res.set('Cache-Control', 'public, max-age=300');
    res.status(200).json({ keys: this.getJwks() });
  };

  status = (_req: Request, res: Response): void => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json(this.getKeyStatus());
  };
}
