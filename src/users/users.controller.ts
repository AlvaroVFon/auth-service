import { Request, Response } from 'express';

import { Catch } from '../common/decorators/catch.decorator';
import { Roles } from '../common/enums/roles.enum';
import { EntityNotFoundError } from '../common/exceptions/base.exception';
import { User as UserInterface } from './users.interface';
import { UsersService } from './users.service';

const pickUserProfile = (
  body: Record<string, unknown>,
): Partial<UserInterface> => {
  const profile: Partial<UserInterface> = {};

  if (typeof body['username'] === 'string') {
    profile.username = body['username'];
  }
  if (typeof body['email'] === 'string') {
    profile.email = body['email'];
  }
  if (typeof body['password'] === 'string') {
    profile.password = body['password'];
  }
  if (typeof body['verified'] === 'boolean') {
    profile.verified = body['verified'];
  }

  return profile;
};

export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Catch()
  async createUser(req: Request, res: Response): Promise<void> {
    const profile = pickUserProfile(req.body ?? {});
    const newUser = await this.userService.create({
      ...profile,
      role: Roles.USER,
    });

    res.status(201).json(newUser);
  }

  @Catch()
  async getById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const users = await this.userService.findById(id);

    if (!users) {
      throw new EntityNotFoundError('User not found');
    }

    res.status(200).json(users);
  }

  @Catch()
  async findAll(_req: Request, res: Response): Promise<void> {
    const users = await this.userService.findAll();

    res.status(200).json(users);
  }

  @Catch()
  async updateOneById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const updateData = {
      ...req.body,
    } as Record<string, unknown>;

    // `role` is the only field the API must never write; the remaining user
    // fields (including lockout bookkeeping) keep their previous behaviour.
    delete updateData['role'];
    delete updateData['_id'];
    delete updateData['id'];
    delete updateData['__v'];

    const updatedUser = await this.userService.updateOneById(
      id,
      updateData as Partial<UserInterface>,
    );

    res.status(200).json(updatedUser);
  }

  @Catch()
  async deleteUser(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    await this.userService.deleteOneById(id);

    res.status(204).json();
  }
}
