import { Router, Request, Response } from 'express';

const router: Router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.status(200).send('OK');
});

export { router as healthCheckRouter };
