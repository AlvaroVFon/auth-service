import { Application } from '../../../../src/applications/applications.interface';
import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../src/applications/applications.service';
import {
  EntityAlreadyExistsError,
  InvalidArgumentError,
} from '../../../../src/common/exceptions/base.exception';
import fixture from '../../../fixtures';
import { ApplicationFactory } from '../../../helpers/factories/application.factory';

describe('ApplicationsService', () => {
  let applicationsService: ApplicationsService;

  before(() => {
    applicationsService = new ApplicationsService(ApplicationModel);
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
});
