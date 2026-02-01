import { Request, Response } from 'express';
import { UsersService } from './users.service';
import { Catch } from '../common/decorators/catch.decorator';

export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Catch()
  async createUser(req: Request, res: Response): Promise<void> {
    const userData = req.body;
    const newUser = await this.userService.create(userData);

    res.status(201).json(newUser);
  }

  @Catch()
  async getById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const users = await this.userService.findById(id);

    res.status(200).json(users);
  }

  @Catch()
  async findAll(req: Request, res: Response): Promise<void> {
    const users = await this.userService.findAll();

    res.status(200).json(users);
  }

  @Catch()
  async updateOneById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const updateData = req.body;
    const updatedUser = await this.userService.updateOneById(id, updateData);

    res.status(200).json(updatedUser);
  }

  @Catch()
  async deleteUser(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    await this.userService.deleteOneById(id);

    res.status(204).json();
  }
}
