import { Application } from 'express';
import { UsersController } from './users.controller';

export class UsersRouter {
  constructor(
    private readonly userController: UsersController,
    private readonly app: Application,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.app.post(
      '/users',
      this.userController.createUser.bind(this.userController),
    );

    this.app.get(
      '/users/:id',
      this.userController.getById.bind(this.userController),
    );

    this.app.patch(
      '/users/:id',
      this.userController.updateOneById.bind(this.userController),
    );

    this.app.delete(
      '/users/:id',
      this.userController.deleteUser.bind(this.userController),
    );
  }
}
