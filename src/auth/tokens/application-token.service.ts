import type { ApplicationsPort } from '../../applications';
import { ForbiddenError } from '../../common/exceptions/auth.exceptions';
import { EntityNotFoundError } from '../../common/exceptions/base.exception';
import { assertObjectId } from '../../common/validators/object-id';
import type { GrantsPort } from '../../grants';
import { GrantRoles } from '../../grants';
import { JwtService } from '../../libs/jwt';

export interface IssuedApplicationToken {
  accessToken: string;
  audience: string;
  role: GrantRoles;
}

export class ApplicationTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly applicationsService: ApplicationsPort,
    private readonly grantsService: GrantsPort,
  ) {}

  async issueAccessToken(
    userId: string,
    applicationId: string,
  ): Promise<IssuedApplicationToken> {
    assertObjectId(userId, 'userId');
    assertObjectId(applicationId, 'applicationId');

    const application =
      await this.applicationsService.findAssignableById(applicationId);

    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    const grant = await this.grantsService.findByUserAndApplication(
      userId,
      applicationId,
    );

    if (!grant) {
      throw new ForbiddenError('User has no access to this application');
    }

    return {
      accessToken: this.jwtService.signAccessToken(
        userId,
        grant.role,
        application.audience,
      ),
      audience: application.audience,
      role: grant.role,
    };
  }
}
