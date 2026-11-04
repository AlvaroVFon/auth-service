import { InvalidArgumentError } from './exceptions/base.exception';

/** Largest page size any listing may request. */
export const MAX_LIST_LIMIT = 100;

/** Page size used when a resource does not define its own default. */
export const DEFAULT_LIST_LIMIT = 20;

/** Ordering used when the client does not send `sort`. */
export const DEFAULT_LIST_SORT = {
  field: 'createdAt',
  direction: -1,
} as const;

/** Field appended to every ordering to keep pagination deterministic. */
export const TIE_BREAK_FIELD = '_id';

export type ListSortDirection = 1 | -1;

export interface ListSort<TField extends string = string> {
  field: TField;
  direction: ListSortDirection;
}

export interface ListQuery<TField extends string = string> {
  page: number;
  limit: number;
  q?: string;
  sort: ListSort<TField>;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ListQueryOptions<TField extends string = string> {
  /** Fields accepted by `sort`; anything else is rejected with a 400. */
  sortableFields: readonly TField[];
  /**
   * Page size used when `limit` is absent. It is clamped to the range
   * `[1, MAX_LIST_LIMIT]` so a zero or negative value can never turn the
   * listing into an unbounded one.
   */
  defaultLimit?: number;
  /**
   * Ordering used when `sort` is absent. Its field must belong to
   * `sortableFields`, just like a client supplied one; when omitted,
   * `DEFAULT_LIST_SORT` is used and `createdAt` must be sortable.
   */
  defaultSort?: ListSort<TField>;
}

const POSITIVE_INTEGER_REGEX = /^\d+$/;
const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

/**
 * Escapes every regular expression metacharacter of a search term so it can
 * only match itself.
 */
export function escapeSearchTerm(term: string): string {
  return term.replace(REGEX_METACHARACTERS, '\\$&');
}

/**
 * Builds a case insensitive, prefix anchored pattern. The term is escaped, so
 * the query never runs an arbitrary and potentially expensive expression.
 */
export function buildSearchRegex(term: string): RegExp {
  return new RegExp(`^${escapeSearchTerm(term.trim())}`, 'i');
}

/**
 * Translates a parsed ordering into a MongoDB sort object. The `_id` tiebreak
 * is appended so two rows created in the same instant keep a stable order.
 */
export function buildSortObject(
  sort: ListSort,
): Record<string, ListSortDirection> {
  if (sort.field === TIE_BREAK_FIELD) {
    return { [sort.field]: sort.direction };
  }
  return { [sort.field]: sort.direction, [TIE_BREAK_FIELD]: sort.direction };
}

/** Wraps the page items and the total count in the shared listing envelope. */
export function buildPaginatedResult<T>(
  items: readonly T[],
  total: number,
  query: Pick<ListQuery, 'page' | 'limit'>,
): PaginatedResult<T> {
  return {
    items: [...items],
    total,
    page: query.page,
    limit: query.limit,
  };
}

/**
 * Parses `page`, `limit`, `q` and `sort` from a raw query object. Invalid
 * parameters raise `InvalidArgumentError`, which the exception interceptor
 * translates into a 400 response.
 *
 * A configuration whose defaults fall outside the contract (a non positive
 * `defaultLimit` or a `defaultSort` that is not part of `sortableFields`)
 * raises a plain `Error` on every call, even when the request sends its own
 * `sort`, so the mistake surfaces as soon as the endpoint is exercised.
 */
export function parseListQuery<TField extends string = string>(
  raw: Record<string, unknown>,
  options: ListQueryOptions<TField>,
): ListQuery<TField> {
  const page = parsePositiveInteger(raw.page, 'page') ?? 1;
  const requestedLimit = parsePositiveInteger(raw.limit, 'limit');
  const q = parseSearchTerm(raw.q);

  const defaultLimit = resolveDefaultLimit(options.defaultLimit);
  const limit = Math.min(requestedLimit ?? defaultLimit, MAX_LIST_LIMIT);
  const defaultSort = resolveDefaultSort(options);

  return {
    page,
    limit,
    sort: parseSort(raw.sort, options, defaultSort),
    ...(q === undefined ? {} : { q }),
  };
}

function resolveDefaultLimit(defaultLimit: number | undefined): number {
  const value = defaultLimit ?? DEFAULT_LIST_LIMIT;

  if (!Number.isFinite(value)) {
    throw new Error('defaultLimit must be a finite number');
  }

  return Math.min(Math.max(Math.trunc(value), 1), MAX_LIST_LIMIT);
}

function parsePositiveInteger(
  value: unknown,
  name: 'page' | 'limit',
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new InvalidArgumentError(`Invalid ${name}`);
  }
  const raw = String(value).trim();
  if (!POSITIVE_INTEGER_REGEX.test(raw)) {
    throw new InvalidArgumentError(`Invalid ${name}`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError(`Invalid ${name}`);
  }
  return parsed;
}

function parseSearchTerm(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InvalidArgumentError('Invalid q');
  }
  const term = value.trim();
  return term === '' ? undefined : term;
}

/**
 * Resolves the ordering used when `sort` is absent and proves it belongs to
 * the whitelist, so the returned type cannot hold a field that clients are
 * not allowed to sort by.
 */
function resolveDefaultSort<TField extends string>(
  options: ListQueryOptions<TField>,
): ListSort<TField> {
  const fallback: ListSort<string> = options.defaultSort ?? DEFAULT_LIST_SORT;
  const field = fallback.field;
  if (!isSortableField(field, options.sortableFields)) {
    throw new Error(
      `Default sort field "${field}" is not part of sortableFields`,
    );
  }
  return { field, direction: fallback.direction };
}

function isSortableField<TField extends string>(
  field: string,
  sortableFields: readonly TField[],
): field is TField {
  return (sortableFields as readonly string[]).includes(field);
}

function parseSort<TField extends string>(
  value: unknown,
  options: ListQueryOptions<TField>,
  defaultSort: ListSort<TField>,
): ListSort<TField> {
  if (value === undefined) {
    return { ...defaultSort };
  }
  if (typeof value !== 'string') {
    throw new InvalidArgumentError('Invalid sort');
  }

  const raw = value.trim();
  let field = raw;
  let direction: ListSortDirection = 1;

  if (raw.startsWith('-')) {
    field = raw.slice(1);
    direction = -1;
  } else {
    const separator = raw.indexOf(':');
    if (separator !== -1) {
      field = raw.slice(0, separator);
      const rawDirection = raw.slice(separator + 1);
      if (rawDirection !== 'asc' && rawDirection !== 'desc') {
        throw new InvalidArgumentError('Invalid sort');
      }
      direction = rawDirection === 'desc' ? -1 : 1;
    }
  }

  if (field === '' || !isSortableField(field, options.sortableFields)) {
    throw new InvalidArgumentError('Invalid sort');
  }

  return { field, direction };
}
