import { Types } from 'mongoose';

import { Application } from '../../../../src/applications/applications.interface';
import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../src/applications/applications.service';
import {
  AuditEvent,
  AuditEventRecord,
  AuditResult,
  AuditService,
  createAuditEventModel,
} from '../../../../src/audit';
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../../../src/common/exceptions/base.exception';
import fixture from '../../../fixtures';
import { ApplicationFactory } from '../../../helpers/factories/application.factory';
import { silentLogger } from '../../../mocks/logger.mock';

describe('ApplicationsService', () => {
  let applicationsService: ApplicationsService;
  let auditService: AuditService;

  before(() => {
    auditService = new AuditService(createAuditEventModel(), silentLogger);
    applicationsService = new ApplicationsService(
      ApplicationModel,
      auditService,
    );
  });

  const createApplication = () => {
    const application = ApplicationFactory.generate();

    return applicationsService.create({
      name: application.name,
      slug: application.slug,
      audience: application.audience,
    });
  };

  const auditEvents = (applicationId: string) =>
    fixture.find<AuditEventRecord>('AuditEvent', {
      applicationId: new Types.ObjectId(applicationId),
    });

  describe('create', () => {
    test('should persist an active application', async () => {
      const application = ApplicationFactory.generate();

      const created = await applicationsService.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
      });

      assert.ok(created._id);
      assert.strictEqual(created.slug, application.slug);
      assert.strictEqual(created.active, true);
    });

    test('should normalize the slug to lowercase', async () => {
      const application = ApplicationFactory.generate();

      const created = await applicationsService.create({
        name: application.name,
        slug: application.slug.toUpperCase(),
        audience: application.audience,
      });

      assert.strictEqual(created.slug, application.slug);
    });

    test('should require a name', async () => {
      const application = ApplicationFactory.generate();

      await assert.rejects(
        applicationsService.create({
          name: '',
          slug: application.slug,
          audience: application.audience,
        }),
        new InvalidArgumentError('Name is required'),
      );
    });

    test('should require a slug', async () => {
      const application = ApplicationFactory.generate();

      await assert.rejects(
        applicationsService.create({
          name: application.name,
          slug: '',
          audience: application.audience,
        }),
        new InvalidArgumentError('Slug is required'),
      );
    });

    test('should reject an invalid slug', async () => {
      const application = ApplicationFactory.generate();

      await assert.rejects(
        applicationsService.create({
          name: application.name,
          slug: 'mi app!',
          audience: application.audience,
        }),
        new InvalidArgumentError('Slug format is invalid'),
      );
    });

    test('should require an audience', async () => {
      const application = ApplicationFactory.generate();

      await assert.rejects(
        applicationsService.create({
          name: application.name,
          slug: application.slug,
          audience: '',
        }),
        new InvalidArgumentError('Audience is required'),
      );
    });

    test('should reject a duplicated slug', async () => {
      const application = ApplicationFactory.generate();
      await applicationsService.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
      });

      const other = ApplicationFactory.generate();

      await assert.rejects(
        applicationsService.create({
          name: other.name,
          slug: application.slug,
          audience: other.audience,
        }),
        new EntityAlreadyExistsError('Application slug already exists'),
      );
    });

    test('should reject a duplicated audience', async () => {
      const application = ApplicationFactory.generate();
      await applicationsService.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
      });

      const other = ApplicationFactory.generate();

      await assert.rejects(
        applicationsService.create({
          name: other.name,
          slug: other.slug,
          audience: application.audience,
        }),
        new EntityAlreadyExistsError('Application audience already exists'),
      );
    });
  });

  describe('findById', () => {
    test('should return the application', async () => {
      const application = ApplicationFactory.generate();
      const created = await applicationsService.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
      });

      const found = await applicationsService.findById(created._id.toString());

      assert.strictEqual(found?._id.toString(), created._id.toString());
    });

    test('should reject an empty id', async () => {
      await assert.rejects(
        applicationsService.findById(''),
        new InvalidArgumentError('ID is required'),
      );
    });

    test('should reject an invalid id', async () => {
      await assert.rejects(
        applicationsService.findById('bad-id'),
        new InvalidArgumentError('ID format is invalid'),
      );
    });
  });

  describe('findBySlug', () => {
    test('should return the application for an existing slug', async () => {
      const application = ApplicationFactory.generate();
      const created = await applicationsService.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
      });

      const found = await applicationsService.findBySlug(application.slug);

      assert.strictEqual(found?._id.toString(), created._id.toString());
    });

    test('should return null for an unknown slug', async () => {
      const found = await applicationsService.findBySlug('unknown-app');

      assert.strictEqual(found, null);
    });
  });

  describe('findByAudience', () => {
    test('should return the application for an existing audience', async () => {
      const application = ApplicationFactory.generate();
      const created = await applicationsService.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
      });

      const found = await applicationsService.findByAudience(
        application.audience,
      );

      assert.strictEqual(found?._id.toString(), created._id.toString());
    });

    test('should keep the audience case-sensitive', async () => {
      const application = ApplicationFactory.generate();
      await applicationsService.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
      });

      const found = await applicationsService.findByAudience(
        application.audience.toUpperCase(),
      );

      assert.strictEqual(found, null);
    });

    test('should return null for an unknown audience', async () => {
      const found =
        await applicationsService.findByAudience('unknown-audience');

      assert.strictEqual(found, null);
    });

    test('should reject a blank audience', async () => {
      await assert.rejects(
        applicationsService.findByAudience('  '),
        new InvalidArgumentError('Audience is required'),
      );
    });
  });

  describe('findBySlugOrAudience', () => {
    test('should resolve a slug case-insensitively', async () => {
      const application = ApplicationFactory.generate();
      const created = await applicationsService.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
      });

      const found = await applicationsService.findBySlugOrAudience(
        application.slug.toUpperCase(),
      );

      assert.strictEqual(found?._id.toString(), created._id.toString());
    });

    test('should resolve an audience', async () => {
      const application = ApplicationFactory.generate();
      const created = await applicationsService.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
      });

      const found = await applicationsService.findBySlugOrAudience(
        application.audience,
      );

      assert.strictEqual(found?._id.toString(), created._id.toString());
    });

    test('should resolve an inactive application so the caller decides', async () => {
      const application = ApplicationFactory.generate();
      const created = await fixture.create<Application>('Application', {
        ...application,
        active: false,
      });

      const found = await applicationsService.findBySlugOrAudience(
        application.slug,
      );

      assert.strictEqual(found?._id.toString(), created._id.toString());
    });

    test('should return null for an unknown identifier', async () => {
      const found = await applicationsService.findBySlugOrAudience('unknown');

      assert.strictEqual(found, null);
    });

    test('should reject a blank identifier', async () => {
      await assert.rejects(
        applicationsService.findBySlugOrAudience('  '),
        new InvalidArgumentError('Application identifier is required'),
      );
    });
  });

  describe('findAll', () => {
    test('should return every application', async () => {
      const first = ApplicationFactory.generate();
      const second = ApplicationFactory.generate();
      await applicationsService.create({
        name: first.name,
        slug: first.slug,
        audience: first.audience,
      });
      await applicationsService.create({
        name: second.name,
        slug: second.slug,
        audience: second.audience,
      });

      const applications = await applicationsService.findAll();

      assert.strictEqual(applications.length, 2);
    });
  });

  describe('findAssignableById', () => {
    test('should return an active application', async () => {
      const application = ApplicationFactory.generate();
      const created = await applicationsService.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
      });

      const found = await applicationsService.findAssignableById(
        created._id.toString(),
      );

      assert.strictEqual(found?._id.toString(), created._id.toString());
    });

    test('should return null for an inactive application', async () => {
      const application = ApplicationFactory.generate();
      const created = await fixture.create<Application>('Application', {
        ...application,
        active: false,
      });

      const found = await applicationsService.findAssignableById(
        created._id.toString(),
      );

      assert.strictEqual(found, null);
    });
  });
  describe('findActiveByIds', () => {
    test('should return only active applications', async () => {
      const active = ApplicationFactory.generate();
      const inactive = ApplicationFactory.generate();
      const createdActive = await applicationsService.create({
        name: active.name,
        slug: active.slug,
        audience: active.audience,
      });
      const createdInactive = await fixture.create<Application>('Application', {
        ...inactive,
        active: false,
      });

      const applications = await applicationsService.findActiveByIds([
        createdActive._id.toString(),
        createdInactive._id.toString(),
      ]);

      assert.deepStrictEqual(
        applications.map((application) => application._id.toString()),
        [createdActive._id.toString()],
      );
    });

    test('should reject an invalid id', async () => {
      await assert.rejects(
        applicationsService.findActiveByIds(['bad-id']),
        InvalidArgumentError,
      );
    });
  });

  describe('update', () => {
    test('AC-1: renames the application and records application.updated', async () => {
      const created = await createApplication();
      const actorId = new Types.ObjectId().toString();

      const updated = await applicationsService.update(
        created._id.toString(),
        { name: '  Renamed Application  ' },
        actorId,
      );

      assert.strictEqual(updated.name, 'Renamed Application');

      const persisted = await applicationsService.findById(
        created._id.toString(),
      );
      assert.strictEqual(persisted?.name, 'Renamed Application');

      const events = await auditEvents(created._id.toString());
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.event, AuditEvent.APPLICATION_UPDATED);
      assert.strictEqual(events[0]?.result, AuditResult.SUCCESS);
      assert.strictEqual(events[0]?.actorId?.toString(), actorId);
      assert.strictEqual(
        events[0]?.applicationId?.toString(),
        created._id.toString(),
      );
    });

    test('AC-2: records application.deactivated when active is false', async () => {
      const created = await createApplication();

      const updated = await applicationsService.update(created._id.toString(), {
        active: false,
      });

      assert.strictEqual(updated.active, false);

      const events = await auditEvents(created._id.toString());
      assert.deepStrictEqual(
        events.map((event) => event.event),
        [AuditEvent.APPLICATION_DEACTIVATED],
      );
    });

    test('AC-2: records application.activated when active is true', async () => {
      const created = await createApplication();
      await applicationsService.update(created._id.toString(), {
        active: false,
      });

      const updated = await applicationsService.update(created._id.toString(), {
        active: true,
      });

      assert.strictEqual(updated.active, true);

      const events = await auditEvents(created._id.toString());
      assert.deepStrictEqual(
        events.map((event) => event.event).sort(),
        [
          AuditEvent.APPLICATION_DEACTIVATED,
          AuditEvent.APPLICATION_ACTIVATED,
        ].sort(),
      );
    });

    test('AC-2: keeps the slug and the audience immutable', async () => {
      const created = await createApplication();

      const payloads: Record<string, unknown>[] = [
        { slug: 'another-slug' },
        { audience: 'another-audience' },
        { slug: 'another-slug', audience: 'another-audience' },
        { _id: new Types.ObjectId().toString() },
        { __v: 5 },
      ];

      for (const payload of payloads) {
        await assert.rejects(
          applicationsService.update(created._id.toString(), payload),
          InvalidArgumentError,
        );
      }

      const persisted = await applicationsService.findById(
        created._id.toString(),
      );
      assert.strictEqual(persisted?.slug, created.slug);
      assert.strictEqual(persisted?.audience, created.audience);
      assert.strictEqual((await auditEvents(created._id.toString())).length, 0);
    });

    test('AC-5: rejects an empty or non-string name without modifying the document', async () => {
      const created = await createApplication();

      for (const payload of [{ name: '' }, { name: '   ' }, { name: 42 }]) {
        await assert.rejects(
          applicationsService.update(created._id.toString(), payload),
          InvalidArgumentError,
        );
      }

      const persisted = await applicationsService.findById(
        created._id.toString(),
      );
      assert.strictEqual(persisted?.name, created.name);
      assert.strictEqual((await auditEvents(created._id.toString())).length, 0);
    });

    test('rejects a non-boolean active value', async () => {
      const created = await createApplication();

      await assert.rejects(
        applicationsService.update(created._id.toString(), { active: 'true' }),
        InvalidArgumentError,
      );

      const persisted = await applicationsService.findById(
        created._id.toString(),
      );
      assert.strictEqual(persisted?.active, true);
    });

    test('rejects an unknown application', async () => {
      await assert.rejects(
        applicationsService.update(new Types.ObjectId().toString(), {
          name: 'Renamed',
        }),
        new EntityNotFoundError('Application not found'),
      );
    });

    test('rejects an invalid id', async () => {
      await assert.rejects(
        applicationsService.update('bad-id', { name: 'Renamed' }),
        InvalidArgumentError,
      );
    });

    test('works without the optional audit service', async () => {
      const serviceWithoutAudit = new ApplicationsService(ApplicationModel);
      const created = await createApplication();

      const updated = await serviceWithoutAudit.update(created._id.toString(), {
        name: 'No audit',
      });

      assert.strictEqual(updated.name, 'No audit');
      assert.strictEqual((await auditEvents(created._id.toString())).length, 0);
    });
  });

  describe('archive', () => {
    test('AC-3: is idempotent, keeps the grants and records application.archived', async () => {
      const created = await createApplication();
      const userId = new Types.ObjectId();
      await fixture.create('Grant', {
        userId,
        applicationId: created._id,
        role: 'viewer',
      });
      const actorId = new Types.ObjectId().toString();

      const first = await applicationsService.archive(
        created._id.toString(),
        actorId,
      );
      const second = await applicationsService.archive(
        created._id.toString(),
        actorId,
      );

      assert.strictEqual(first.active, false);
      assert.strictEqual(second.active, false);

      const persisted = await applicationsService.findById(
        created._id.toString(),
      );
      assert.ok(persisted);
      assert.strictEqual(persisted?.active, false);

      const grants = await fixture.find('Grant', {
        applicationId: created._id,
      });
      assert.strictEqual(grants.length, 1);

      const events = await auditEvents(created._id.toString());
      assert.deepStrictEqual(
        events.map((event) => event.event),
        [AuditEvent.APPLICATION_ARCHIVED, AuditEvent.APPLICATION_ARCHIVED],
      );
      assert.strictEqual(events[0]?.actorId?.toString(), actorId);
    });

    test('rejects an unknown application', async () => {
      await assert.rejects(
        applicationsService.archive(new Types.ObjectId().toString()),
        new EntityNotFoundError('Application not found'),
      );
    });

    test('rejects an invalid id', async () => {
      await assert.rejects(
        applicationsService.archive('bad-id'),
        InvalidArgumentError,
      );
    });
  });
});
