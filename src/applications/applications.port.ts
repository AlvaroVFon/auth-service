import type {
  ListQuery,
  ListQueryOptions,
  PaginatedResult,
} from '../common/pagination';
import type { SettingsChanges } from '../settings';
import { Application } from './applications.interface';

/** Fields the owner may order the application catalog by. */
export const APPLICATION_SORTABLE_FIELDS = [
  'name',
  'slug',
  'audience',
  'active',
  'createdAt',
] as const;

export type ApplicationSortField = (typeof APPLICATION_SORTABLE_FIELDS)[number];

/** Default query contract of `GET /applications`. */
export const APPLICATION_LIST_OPTIONS: ListQueryOptions<ApplicationSortField> =
  {
    sortableFields: APPLICATION_SORTABLE_FIELDS,
    defaultSort: { field: 'name', direction: 1 },
  };

export interface CreateApplicationInput {
  name: string;
  slug: string;
  audience: string;
}

/**
 * Only `name` and `active` are mutable; the values stay `unknown` so the
 * service can reject anything the schema does not allow at runtime.
 */
export interface UpdateApplicationInput {
  name?: unknown;
  active?: unknown;
}

/** Catalog counters used by the admin overview. */
export interface ApplicationCounts {
  total: number;
  active: number;
  inactive: number;
}

export interface ApplicationsPort {
  countApplications(): Promise<ApplicationCounts>;
  create(input: CreateApplicationInput): Promise<Application>;
  update(
    id: string,
    input: UpdateApplicationInput,
    actorId?: string,
  ): Promise<Application>;
  archive(id: string, actorId?: string): Promise<Application>;
  findById(id: string): Promise<Application | null>;
  findBySlug(slug: string): Promise<Application | null>;
  findByAudience(audience: string): Promise<Application | null>;
  findBySlugOrAudience(identifier: string): Promise<Application | null>;
  findAll(
    query: ListQuery<ApplicationSortField>,
  ): Promise<PaginatedResult<Application>>;
  /** Every application, used to build the owner's auth context. */
  findAllForContext(): Promise<Application[]>;
  updateSettings(id: string, changes: SettingsChanges): Promise<void>;
  findActiveByIds(ids: string[]): Promise<Application[]>;
  findAssignableById(id: string): Promise<Application | null>;
}
