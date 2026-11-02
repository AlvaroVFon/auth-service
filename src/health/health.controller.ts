import type { Request, Response } from 'express';

export class HealthController {
  constructor(private readonly getReadyState: () => number) {}

  check = (_req: Request, res: Response): void => {
    res.status(200).json({ status: 'ok' });
  };

  ready = (_req: Request, res: Response): void => {
    const ready = this.getReadyState() === 1;

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not ready',
    });
  };
}
