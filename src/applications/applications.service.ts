import { Model } from 'mongoose';

import { SLUG_REGEX } from '../common/constants/regex';
import {
  EntityAlreadyExistsError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import {
  DuplicateKeyError,
  duplicateKeyFields,
  isDuplicateKeyError,
} from '../common/mongo/duplicate-key';
import { assertObjectId } from '../common/validators/object-id';
import { Application } from './applications.interface';
import { ApplicationsPort, CreateApplicationInput } from './applications.port';

export class ApplicationsService implements ApplicationsPort {
  constructor(private readonly applicationModel: Model<Application>) {}

  async create(input: CreateApplicationInput): Promise<Application> {
    const name = input.name?.trim();
    const slug = input.slug?.trim().toLowerCase();
    const audience = input.audience?.trim();

    if (!name) {
      throw new InvalidArgumentError('Name is required');
    }
    if (!slug) {
      throw new InvalidArgumentError('Slug is required');
    }
    if (!SLUG_REGEX.test(slug)) {
      throw new InvalidArgumentError('Slug format is invalid');
    }
    if (!audience) {
      throw new InvalidArgumentError('Audience is required');
    }

    try {
      return await this.applicationModel.create({
        name,
        slug,
        audience,
        active: true,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new EntityAlreadyExistsError(
          this.duplicateApplicationMessage(error),
        );
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Application | null> {
    assertObjectId(id);

    return this.applicationModel.findById(id);
  }

  async findBySlug(slug: string): Promise<Application | null> {
    if (!slug) {
      throw new InvalidArgumentError('Slug is required');
    }

    return this.applicationModel.findOne({ slug: slug.trim().toLowerCase() });
  }

  async findByAudience(audience: string): Promise<Application | null> {
    if (!audience || !audience.trim()) {
      throw new InvalidArgumentError('Audience is required');
    }

    return this.applicationModel.findOne({ audience: audience.trim() });
  }

  async findBySlugOrAudience(identifier: string): Promise<Application | null> {
    if (!identifier || !identifier.trim()) {
      throw new InvalidArgumentError('Application identifier is required');
    }

    const value = identifier.trim();

    // Slug wins when it collides with another application's audience.
    const bySlug = await this.applicationModel.findOne({
      slug: value.toLowerCase(),
    });

    return bySlug ?? (await this.findByAudience(value));
  }

  async findAll(): Promise<Application[]> {
    return this.applicationModel.find();
  }

  async findActiveByIds(ids: string[]): Promise<Application[]> {
    if (ids.length === 0) {
      return [];
    }

    for (const id of ids) {
      assertObjectId(id);
    }

    return this.applicationModel.find({
      _id: { $in: ids },
      active: true,
    });
  }

  async findAssignableById(id: string): Promise<Application | null> {
    const application = await this.findById(id);

    return application?.active ? application : null;
  }

  private duplicateApplicationMessage(error: DuplicateKeyError): string {
    const fields = duplicateKeyFields(error);
    if (fields.includes('slug')) {
      return 'Application slug already exists';
    }
    if (fields.includes('audience')) {
      return 'Application audience already exists';
    }

    return 'Application already exists';
  }
}
