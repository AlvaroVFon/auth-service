import { Model } from 'mongoose';

import { OBJECTID_REGEX, SLUG_REGEX } from '../common/constants/regex';
import {
  EntityAlreadyExistsError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { Application } from './applications.interface';
import { ApplicationsPort, CreateApplicationInput } from './applications.port';

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 11000;

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

    const existingSlug = await this.applicationModel.findOne({ slug });
    if (existingSlug) {
      throw new EntityAlreadyExistsError('Application slug already exists');
    }

    const existingAudience = await this.applicationModel.findOne({ audience });
    if (existingAudience) {
      throw new EntityAlreadyExistsError('Application audience already exists');
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
        throw new EntityAlreadyExistsError('Application already exists');
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Application | null> {
    this.assertObjectId(id);

    return this.applicationModel.findById(id);
  }

  async findBySlug(slug: string): Promise<Application | null> {
    if (!slug) {
      throw new InvalidArgumentError('Slug is required');
    }

    return this.applicationModel.findOne({ slug: slug.trim().toLowerCase() });
  }

  async findAll(): Promise<Application[]> {
    return this.applicationModel.find();
  }

  async findAssignableById(id: string): Promise<Application | null> {
    const application = await this.findById(id);

    return application?.active ? application : null;
  }

  private assertObjectId(id: string): void {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }
  }
}
