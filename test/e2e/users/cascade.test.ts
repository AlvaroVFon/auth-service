import { Application } from 'express';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { ApplicationModel } from '../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../src/applications/applications.service';
import { GrantRoles } from '../../../src/grants/grants.interface';
import { GrantModel } from '../../../src/grants/grants.schema';
import { GrantsService } from '../../../src/grants/grants.service';
import { CryptoService } from '../../../src/libs/crypto/crypto.service';
import type { User as UserInterface } from '../../../src/users/users.interface';
import { User } from '../../../src/users/users.schema';
import { UsersService } from '../../../src/users/users.service';
import fixture from '../../fixtures';
import { DEFAULT_OWNER_TOKEN } from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { UserFactory } from '../../helpers/factories/user.factory';
import { getTestAppInstance } from '../../utils/app';

describe('E2E user deletion cascade', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should delete the grants of the deleted user only', async () => {
    const usersService = new UsersService(User, new CryptoService());
    const grantsService = new GrantsService(
      GrantModel,
      new ApplicationsService(ApplicationModel),
      usersService,
    );

    const user = await fixture.create<UserInterface>(
      'User',
      UserFactory.generate(),
    );
    const otherUser = await fixture.create<UserInterface>(
      'User',
      UserFactory.generate(),
    );
    const application = await fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );
    const applicationId = application._id.toString();

    await grantsService.assignRole({
      userId: user._id.toString(),
      applicationId,
      role: GrantRoles.VIEWER,
    });
    await grantsService.assignRole({
      userId: otherUser._id.toString(),
      applicationId,
      role: GrantRoles.VIEWER,
    });

    await request(app)
      .delete(`/users/${user._id.toString()}`)
      .set('Authorization', `Bearer ${DEFAULT_OWNER_TOKEN}`)
      .expect(204);

    const remaining = await fixture.find('Grant', {
      applicationId: application._id,
    });

    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(
      (remaining[0] as { userId: { toString(): string } }).userId.toString(),
      otherUser._id.toString(),
    );
  });
});
