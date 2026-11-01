import { Grant, GrantRoles } from '../../../../src/grants/grants.interface';
import fixture from '../../../fixtures';

describe('Grant schema', () => {
  test('should persist a grant with the viewer role by default', async () => {
    const grant = await fixture.create<Grant>('Grant');

    assert.strictEqual(grant.role, GrantRoles.VIEWER);
  });

  test('should reject an unknown role', async () => {
    await assert.rejects(
      fixture.create<Grant>('Grant', { role: 'owner' as GrantRoles }),
      (error: Error) => error.name === 'ValidationError',
    );
  });
});
