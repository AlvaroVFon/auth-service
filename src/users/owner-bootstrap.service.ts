import { normalizeEmail } from '../common/email';
import { Roles } from '../common/enums/roles.enum';
import {
  EntityAlreadyExistsError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { isDuplicateKeyError } from '../common/mongo/duplicate-key';
import type { User } from './users.interface';
import type { UsersPort } from './users.port';

export interface OwnerBootstrapResult {
  created: boolean;
  userId: string;
  email: string;
}

export class OwnerBootstrapService {
  constructor(private readonly usersService: UsersPort) {}

  async ensureOwner(
    email: string,
    password: string,
  ): Promise<OwnerBootstrapResult> {
    const normalizedEmail = normalizeEmail(email);
    const existing = await this.usersService.findByRole(Roles.OWNER);

    if (existing) {
      this.assertSameOwner(existing, normalizedEmail);
      return this.toResult(existing, false);
    }

    try {
      const owner = await this.usersService.createOwner(
        normalizedEmail,
        password,
      );

      return this.toResult(owner, true);
    } catch (error) {
      if (
        !(error instanceof EntityAlreadyExistsError) &&
        !isDuplicateKeyError(error)
      ) {
        throw error;
      }

      const owner = await this.usersService.findByRole(Roles.OWNER);
      if (!owner) {
        throw error;
      }

      this.assertSameOwner(owner, normalizedEmail);

      return this.toResult(owner, false);
    }
  }

  private assertSameOwner(owner: User, email: string): void {
    if (normalizeEmail(owner.email) !== email) {
      throw new InvalidArgumentError(
        'An owner already exists with a different email',
      );
    }
  }

  private toResult(owner: User, created: boolean): OwnerBootstrapResult {
    return {
      created,
      userId: owner._id.toString(),
      email: owner.email,
    };
  }
}
