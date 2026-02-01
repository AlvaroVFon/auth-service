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
    this.app.post('/users', async (req, res, next) => {
      try {
        await this.userController.createUser(req, res);
      } catch (error) {
        next(error);
      }
    });

    this.app.get('/users/:id', async (req, res, next) => {
      try {
        await this.userController.getById(req, res);
      } catch (error) {
        next(error);
      }
    });

    this.app.patch('/users/:id', async (req, res, next) => {
      try {
        await this.userController.updateOneById(req, res);
      } catch (error) {
        next(error);
      }
    });

    this.app.delete('/users/:id', async (req, res, next) => {
      try {
        await this.userController.deleteUser(req, res);
      } catch (error) {
        next(error);
      }
    });
  }
}
