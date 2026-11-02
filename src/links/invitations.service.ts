import type { ApplicationsPort } from '../applications';
import { EMAIL_REGEX, PASSWORD_REGEX } from '../common/constants/regex';
import { normalizeEmail } from '../common/email';
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { InvalidLinkError } from '../common/exceptions/links.exceptions';
import { assertObjectId } from '../common/validators/object-id';
import type { GrantsPort } from '../grants';
import { GrantRoles } from '../grants';
import type { HoldersPort } from '../holders';
import { CryptoService } from '../libs/crypto';
import { LoggerInterface } from '../libs/logger';
import type { UsersPort } from '../users';
import { buildInvitationLink } from './link-urls';
import { LinkType } from './link.interface';
import type { LinksPort } from './links.port';

export interface CreateInvitationInput {
  email: string;
  applicationId: string;
  role: GrantRoles;
}

export interface CreatedInvitation {
  link: string;
  expiresAt: Date;
  email: string;
  applicationId: string;
  role: GrantRoles;
}

export interface AcceptInvitationInput {
  token: string;
  password: string;
  passwordConfirmation: string;
}

export class InvitationsService {
  constructor(
    private readonly linksService: LinksPort,
    private readonly usersService: UsersPort,
    private readonly holdersService: HoldersPort,
    private readonly grantsService: GrantsPort,
    private readonly applicationsService: ApplicationsPort,
    private readonly cryptoService: CryptoService,
    private readonly publicAppUrl: string,
    private readonly logger: LoggerInterface,
  ) {}

  async create(input: CreateInvitationInput): Promise<CreatedInvitation> {
    const email = normalizeEmail(input.email ?? '');

    if (!EMAIL_REGEX.test(email)) {
      throw new InvalidArgumentError('Invalid email format');
    }
    assertObjectId(input.applicationId, 'applicationId');
    if (!Object.values(GrantRoles).includes(input.role)) {
      throw new InvalidArgumentError('Invalid role');
    }

    const application = await this.applicationsService.findAssignableById(
      input.applicationId,
    );
    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    const existingUser = await this.usersService.findByEmail(email);
    const existingHolder = await this.holdersService.findByEmail(email);
    if (existingUser || existingHolder) {
      throw new EntityAlreadyExistsError('Email already has an account');
    }

    const created = await this.linksService.createInvitation({
      email,
      applicationId: input.applicationId,
      role: input.role,
    });

    return {
      link: buildInvitationLink(this.publicAppUrl, created.token),
      expiresAt: created.link.expiresAt,
      email,
      applicationId: input.applicationId,
      role: input.role,
    };
  }

  async accept(input: AcceptInvitationInput): Promise<void> {
    this.validatePassword(input.password, input.passwordConfirmation);

    if (!input.token) {
      throw new InvalidLinkError();
    }

    const link = await this.linksService.consume(
      input.token,
      LinkType.INVITATION,
    );

    if (!link.email || !link.applicationId || !link.role) {
      throw new InvalidLinkError();
    }

    const passwordHash = await this.cryptoService.hashString(input.password);

    let user;
    try {
      user = await this.usersService.createVerifiedUser({
        email: link.email,
        passwordHash,
      });
    } catch (error) {
      await this.release(link._id.toString());
      throw error;
    }

    const userId = user._id.toString();
    try {
      await this.grantsService.assignRole({
        userId,
        applicationId: link.applicationId.toString(),
        role: link.role,
      });
    } catch (error) {
      await Promise.allSettled([
        this.usersService.deleteOneById(userId),
        this.linksService.release(link._id.toString()),
      ]);
      throw error;
    }
  }

  private validatePassword(
    password: string,
    passwordConfirmation: string,
  ): void {
    if (!password) {
      throw new InvalidArgumentError('password is required');
    }
    if (!PASSWORD_REGEX.test(password)) {
      throw new InvalidArgumentError(
        'Password does not meet complexity requirements',
      );
    }
    if (!passwordConfirmation) {
      throw new InvalidArgumentError('passwordConfirmation is required');
    }
    if (password !== passwordConfirmation) {
      throw new InvalidArgumentError(
        'Password and password confirmation do not match',
      );
    }
  }

  private async release(linkId: string): Promise<void> {
    try {
      await this.linksService.release(linkId);
    } catch (error) {
      this.logger.warn(`Failed to release invitation link ${linkId}`, error);
    }
  }
}
