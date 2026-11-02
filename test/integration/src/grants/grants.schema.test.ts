import { Types, model } from 'mongoose';

import { Grant, GrantRoles } from '../../../../src/grants/grants.interface';
import fixture from '../../../fixtures';

describe('Grant schema', () => {
  test('should persist the role provided for the grant', async () => {
    const grant = await fixture.create<Grant>('Grant', {
      role: GrantRoles.EDITOR,
    });

    assert.strictEqual(grant.role, GrantRoles.EDITOR);
  });

  test('should reject a grant without a role', async () => {
    const GrantModel = model<Grant>('Grant');

    await assert.rejects(
      GrantModel.create({
        userId: new Types.ObjectId(),
        applicationId: new Types.ObjectId(),
      }),
      (error: Error) => error.name === 'ValidationError',
    );
  });

  test('should reject an unknown role', async () => {
    await assert.rejects(
      fixture.create<Grant>('Grant', { role: 'owner' as GrantRoles }),
      (error: Error) => error.name === 'ValidationError',
    );
  });
});
