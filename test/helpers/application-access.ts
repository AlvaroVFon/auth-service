import { Types } from 'mongoose';

import { Application } from '../../src/applications/applications.interface';
import { Grant, GrantRoles } from '../../src/grants/grants.interface';
import fixture from '../fixtures';
import { ApplicationFactory } from './factories/application.factory';
import { GrantFactory } from './factories/grant.factory';

export interface ApplicationAccess {
  application: Application;
  grant: Grant;
}

export const createApplicationAccess = async (
  userId: string,
  role: GrantRoles = GrantRoles.VIEWER,
): Promise<ApplicationAccess> => {
  const application = await fixture.create<Application>(
    'Application',
    ApplicationFactory.generate(),
  );
  const grant = await fixture.create<Grant>(
    'Grant',
    GrantFactory.generate({
      userId: new Types.ObjectId(userId),
      applicationId: application._id,
      role,
    }),
  );

  return { application, grant };
};
