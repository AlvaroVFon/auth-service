import { Request, Response } from 'express';
import { UsersService } from './users.service';

export class UsersController {
  constructor(private readonly userService: UsersService) {}

  async createUser(req: Request, res: Response): Promise<void> {
    const userData = req.body;
    const newUser = await this.userService.create(userData);

    res.status(201).json(newUser);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const users = await this.userService.findById(id);

    res.status(200).json(users);
  }
}
