import { Application } from './applications.interface';

export interface CreateApplicationInput {
  name: string;
  slug: string;
  audience: string;
}

export interface ApplicationsPort {
  create(input: CreateApplicationInput): Promise<Application>;
  findById(id: string): Promise<Application | null>;
  findBySlug(slug: string): Promise<Application | null>;
  findByAudience(audience: string): Promise<Application | null>;
  findBySlugOrAudience(identifier: string): Promise<Application | null>;
  findAll(): Promise<Application[]>;
  findActiveByIds(ids: string[]): Promise<Application[]>;
  findAssignableById(id: string): Promise<Application | null>;
}
