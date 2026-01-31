import { Application, Router } from 'express';
import { UsersController } from './users.controller';

export class UsersRouter {
  public router: Router;

  constructor(
    private readonly userController: UsersController,
    private readonly app: Application,
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post('/users', (req, res) =>
      this.userController.createUser(req, res),
    );

    this.router.get('/users/:id', (req, res) =>
      this.userController.getById(req, res),
    );

    this.app.use(this.router);
  }
}
