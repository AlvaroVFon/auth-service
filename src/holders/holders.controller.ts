import { Request, Response } from 'express';

import { Catch } from '../common/decorators/catch.decorator';
import { parseListQuery } from '../common/pagination';
import {
  HOLDER_LIST_OPTIONS,
  type HolderSortField,
  type HoldersPort,
} from './holders.port';

export class HoldersController {
  constructor(private readonly holdersService: HoldersPort) {}

  @Catch()
  async list(req: Request, res: Response): Promise<void> {
    const query = parseListQuery<HolderSortField>(
      req.query as Record<string, unknown>,
      HOLDER_LIST_OPTIONS,
    );
    const holders = await this.holdersService.list(query);

    res.status(200).json(holders);
  }
}
