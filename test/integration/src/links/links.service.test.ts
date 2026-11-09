import { Types } from 'mongoose';

import { ForbiddenError } from '../../../../src/common/exceptions/auth.exceptions';
import {
  ConflictError,
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../../../src/common/exceptions/base.exception';
import { InvalidLinkError } from '../../../../src/common/exceptions/links.exceptions';
import { GrantRoles } from '../../../../src/grants';
import { hashLinkToken } from '../../../../src/links/link-token';
import { LinkType, OneTimeLink } from '../../../../src/links/link.interface';
import { LinkModel } from '../../../../src/links/links.schema';
import { LinksService } from '../../../../src/links/links.service';
import fixture from '../../../fixtures';
import { assertTtlIndex } from '../../../helpers/assert-ttl-index';

const APPLICATION_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();

describe('LinksService', () => {
  let service: LinksService;

  before(() => {
    service = new LinksService(LinkModel, 60_000, 30_000);
  });

  describe('createInvitation', () => {
    test('should persist only the hashed token with its metadata', async () => {
      const created = await service.createInvitation({
        email: ' Guest@Example.com ',
        applicationId: APPLICATION_ID,
        role: GrantRoles.EDITOR,
      });

      assert.ok(created.token.length >= 43);
      assert.strictEqual(created.link.tokenHash, hashLinkToken(created.token));
      assert.notStrictEqual(created.link.tokenHash, created.token);
      assert.strictEqual(created.link.email, 'guest@example.com');
      assert.strictEqual(
        created.link.applicationId?.toString(),
        APPLICATION_ID,
      );
      assert.strictEqual(created.link.role, GrantRoles.EDITOR);
      assert.strictEqual(created.link.usedAt, null);
      assert.ok(created.link.expiresAt.getTime() > Date.now());
    });

    test('should reject invalid input', async () => {
      await assert.rejects(
        service.createInvitation({
          email: 'not-an-email',
          applicationId: APPLICATION_ID,
          role: GrantRoles.VIEWER,
        }),
        new InvalidArgumentError('Invalid email format'),
      );

      await assert.rejects(
        service.createInvitation({
          email: 'guest@example.com',
          applicationId: 'bad-id',
          role: GrantRoles.VIEWER,
        }),
        InvalidArgumentError,
      );

      await assert.rejects(
        service.createInvitation({
          email: 'guest@example.com',
          applicationId: APPLICATION_ID,
          role: 'superuser' as GrantRoles,
        }),
        new InvalidArgumentError('Invalid role'),
      );
    });

    test('should invalidate previous invitations for the same email and app', async () => {
      const first = await service.createInvitation({
        email: 'guest@example.com',
        applicationId: APPLICATION_ID,
        role: GrantRoles.VIEWER,
      });
      await service.createInvitation({
        email: 'guest@example.com',
        applicationId: APPLICATION_ID,
        role: GrantRoles.EDITOR,
      });

      await assert.rejects(
        service.consume(first.token, LinkType.INVITATION),
        InvalidLinkError,
      );
    });

    test('should hide the token hash from JSON', async () => {
      const created = await service.createInvitation({
        email: 'guest@example.com',
        applicationId: APPLICATION_ID,
        role: GrantRoles.VIEWER,
      });

      const json = (
        created.link as unknown as { toJSON(): Record<string, unknown> }
      ).toJSON();

      assert.strictEqual('tokenHash' in json, false);
    });
  });

  describe('createPasswordReset', () => {
    test('should persist a reset link for the user', async () => {
      const created = await service.createPasswordReset({ userId: USER_ID });

      assert.strictEqual(created.link.type, LinkType.PASSWORD_RESET);
      assert.strictEqual(created.link.userId?.toString(), USER_ID);
    });

    test('should reject an invalid user id', async () => {
      await assert.rejects(
        service.createPasswordReset({ userId: 'bad-id' }),
        InvalidArgumentError,
      );
    });
  });

  describe('consume', () => {
    test('should consume a valid link exactly once', async () => {
      const created = await service.createInvitation({
        email: 'guest@example.com',
        applicationId: APPLICATION_ID,
        role: GrantRoles.VIEWER,
      });

      const link = await service.consume(created.token, LinkType.INVITATION);
      assert.ok(link.usedAt instanceof Date);

      await assert.rejects(
        service.consume(created.token, LinkType.INVITATION),
        InvalidLinkError,
      );
    });

    test('should let only one concurrent consumer win', async () => {
      const created = await service.createInvitation({
        email: 'guest@example.com',
        applicationId: APPLICATION_ID,
        role: GrantRoles.VIEWER,
      });

      const results = await Promise.allSettled([
        service.consume(created.token, LinkType.INVITATION),
        service.consume(created.token, LinkType.INVITATION),
      ]);

      assert.strictEqual(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
    });

    test('should reject an expired link', async () => {
      const created = await service.createInvitation({
        email: 'guest@example.com',
        applicationId: APPLICATION_ID,
        role: GrantRoles.VIEWER,
      });
      await fixture.updateOne<OneTimeLink>(
        'Link',
        { _id: created.link._id },
        { expiresAt: new Date(Date.now() - 1000) },
      );

      await assert.rejects(
        service.consume(created.token, LinkType.INVITATION),
        InvalidLinkError,
      );
    });

    test('should reject a link used with the wrong type', async () => {
      const created = await service.createInvitation({
        email: 'guest@example.com',
        applicationId: APPLICATION_ID,
        role: GrantRoles.VIEWER,
      });

      await assert.rejects(
        service.consume(created.token, LinkType.PASSWORD_RESET),
        InvalidLinkError,
      );
    });

    test('should reject an unknown or empty token', async () => {
      await assert.rejects(
        service.consume('unknown-token', LinkType.INVITATION),
        InvalidLinkError,
      );
      await assert.rejects(
        service.consume('', LinkType.INVITATION),
        InvalidLinkError,
      );
    });
  });

  describe('invalidateActive', () => {
    test('should require at least one discriminator', async () => {
      await assert.rejects(
        service.invalidateActive({ type: LinkType.INVITATION }),
        new InvalidArgumentError('At least one link discriminator is required'),
      );
    });
  });

  describe('release', () => {
    test('should not revive a link invalidated by a reissue', async () => {
      const first = await service.createInvitation({
        email: 'guest@example.com',
        applicationId: APPLICATION_ID,
        role: GrantRoles.VIEWER,
      });
      const consumed = await service.consume(first.token, LinkType.INVITATION);

      // Reissuing marks every matching link invalidated, including the one
      // currently mid-accept.
      await service.createInvitation({
        email: 'guest@example.com',
        applicationId: APPLICATION_ID,
        role: GrantRoles.EDITOR,
      });

      await service.release(consumed._id.toString());

      await assert.rejects(
        service.consume(first.token, LinkType.INVITATION),
        InvalidLinkError,
      );
    });

    test('should restore a just-claimed unexpired link', async () => {
      const created = await service.createInvitation({
        email: 'guest@example.com',
        applicationId: APPLICATION_ID,
        role: GrantRoles.VIEWER,
      });
      await service.consume(created.token, LinkType.INVITATION);

      await service.release(created.link._id.toString());

      const link = await service.consume(created.token, LinkType.INVITATION);
      assert.ok(link);
    });

    test('should not restore a link claimed long ago', async () => {
      const created = await service.createInvitation({
        email: 'guest@example.com',
        applicationId: APPLICATION_ID,
        role: GrantRoles.VIEWER,
      });
      await service.consume(created.token, LinkType.INVITATION);
      await fixture.updateOne<OneTimeLink>(
        'Link',
        { _id: created.link._id },
        { usedAt: new Date(Date.now() - 60 * 60 * 1000) },
      );

      await service.release(created.link._id.toString());

      await assert.rejects(
        service.consume(created.token, LinkType.INVITATION),
        InvalidLinkError,
      );
    });
  });

  test('should enforce a unique token hash and the TTL index', async () => {
    const tokenHash = hashLinkToken('fixed-token');
    const base = {
      tokenHash,
      type: LinkType.INVITATION,
      email: 'guest@example.com',
      applicationId: new Types.ObjectId(),
      role: GrantRoles.VIEWER,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    };

    await LinkModel.create(base);
    await assert.rejects(LinkModel.create(base));

    await assertTtlIndex(LinkModel, 'expiresAt');
  });
});

describe('LinksService.revokeInvitation', () => {
  const applicationId = new Types.ObjectId();
  const otherApplicationId = new Types.ObjectId();

  const seed = (overrides: Partial<OneTimeLink> = {}) =>
    fixture.create<OneTimeLink>(LinkModel.modelName, {
      type: LinkType.INVITATION,
      applicationId,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    });

  test('invalidates a pending invitation without deleting it', async () => {
    const service = new LinksService(LinkModel, 60_000, 30_000);
    const invitation = await seed({ tokenHash: 'pending' });

    assert.strictEqual(
      await service.revokeInvitation(
        applicationId.toString(),
        invitation._id.toString(),
      ),
      true,
    );

    const stored = await fixture.findById<OneTimeLink>(
      LinkModel.modelName,
      invitation._id.toString(),
    );
    if (!stored) {
      throw new Error('Invitation was deleted');
    }
    assert.ok(stored.invalidatedAt instanceof Date);
    assert.strictEqual(stored.usedAt, null);
  });

  test('treats a repeated revocation as an idempotent no-op', async () => {
    const service = new LinksService(LinkModel, 60_000, 30_000);
    const invitation = await seed({
      tokenHash: 'repeated',
      invalidatedAt: new Date(),
    });

    assert.strictEqual(
      await service.revokeInvitation(
        applicationId.toString(),
        invitation._id.toString(),
      ),
      false,
    );
  });

  test('rejects a used invitation with a conflict', async () => {
    const service = new LinksService(LinkModel, 60_000, 30_000);
    const invitation = await seed({
      tokenHash: 'used',
      usedAt: new Date(),
    });

    await assert.rejects(
      service.revokeInvitation(
        applicationId.toString(),
        invitation._id.toString(),
      ),
      new ConflictError('Invitation already used'),
    );
  });

  test('hides an invitation that belongs to another application', async () => {
    const service = new LinksService(LinkModel, 60_000, 30_000);
    const invitation = await seed({
      tokenHash: 'foreign',
      applicationId: otherApplicationId,
    });

    await assert.rejects(
      service.revokeInvitation(
        applicationId.toString(),
        invitation._id.toString(),
      ),
      new EntityNotFoundError('Invitation not found'),
    );
  });
});

describe('LinksService.resendInvitation', () => {
  const applicationId = new Types.ObjectId();
  const otherApplicationId = new Types.ObjectId();

  test('invalidates the previous link and returns a fresh token', async () => {
    const rawToken = 'old-token';
    const invitation = await fixture.create<OneTimeLink>(LinkModel.modelName, {
      type: LinkType.INVITATION,
      applicationId,
      email: 'resend@example.com',
      role: GrantRoles.VIEWER,
      tokenHash: hashLinkToken(rawToken),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const service = new LinksService(LinkModel, 60_000, 30_000);

    const created = await service.resendInvitation(
      applicationId.toString(),
      invitation._id.toString(),
    );

    const old = await fixture.findById<OneTimeLink>(
      LinkModel.modelName,
      invitation._id.toString(),
    );
    assert.ok(old?.invalidatedAt instanceof Date);
    assert.ok(created.token);
    assert.notStrictEqual(created.link.tokenHash, hashLinkToken(rawToken));

    await assert.rejects(
      service.consume(rawToken, LinkType.INVITATION),
      InvalidLinkError,
    );
  });

  test('rejects a used invitation with a conflict', async () => {
    const invitation = await fixture.create<OneTimeLink>(LinkModel.modelName, {
      type: LinkType.INVITATION,
      applicationId,
      email: 'used@example.com',
      role: GrantRoles.VIEWER,
      tokenHash: 'used-hash',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await assert.rejects(
      new LinksService(LinkModel).resendInvitation(
        applicationId.toString(),
        invitation._id.toString(),
      ),
      ConflictError,
    );
  });

  test('hides an invitation of another application', async () => {
    const invitation = await fixture.create<OneTimeLink>(LinkModel.modelName, {
      type: LinkType.INVITATION,
      applicationId: otherApplicationId,
      email: 'foreign@example.com',
      role: GrantRoles.VIEWER,
      tokenHash: 'foreign-hash',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await assert.rejects(
      new LinksService(LinkModel).resendInvitation(
        applicationId.toString(),
        invitation._id.toString(),
      ),
      EntityNotFoundError,
    );
  });

  test('rejects an admin invitation unless the owner resends it', async () => {
    const invitation = await fixture.create<OneTimeLink>(LinkModel.modelName, {
      type: LinkType.INVITATION,
      applicationId,
      email: 'admin-resend@example.com',
      role: GrantRoles.ADMIN,
      tokenHash: 'admin-resend-hash',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const service = new LinksService(LinkModel);

    await assert.rejects(
      service.resendInvitation(
        applicationId.toString(),
        invitation._id.toString(),
      ),
      ForbiddenError,
    );
    assert.strictEqual(
      await LinkModel.countDocuments({
        email: 'admin-resend@example.com',
        invalidatedAt: null,
      }),
      1,
    );
  });
});
