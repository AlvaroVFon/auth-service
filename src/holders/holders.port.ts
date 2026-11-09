import type {
  ListQuery,
  ListQueryOptions,
  PaginatedResult,
} from '../common/pagination';
import { Holder, HolderListItem } from './holders.interface';

export const HOLDER_SORTABLE_FIELDS = [
  'createdAt',
  'email',
  'expiresAt',
] as const;

export type HolderSortField = (typeof HOLDER_SORTABLE_FIELDS)[number];

export const HOLDER_LIST_OPTIONS: ListQueryOptions<HolderSortField> = {
  sortableFields: HOLDER_SORTABLE_FIELDS,
  defaultSort: { field: 'createdAt', direction: -1 },
};

export interface HoldersPort {
  list(
    query: ListQuery<HolderSortField>,
  ): Promise<PaginatedResult<HolderListItem>>;
  create(email: string, password: string): Promise<Holder>;
  findByEmail(email: string): Promise<Holder | null>;
  findById(id: string): Promise<Holder | null>;
  deleteById(id: string): Promise<void>;
}
