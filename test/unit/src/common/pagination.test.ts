import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_LIST_SORT,
  MAX_LIST_LIMIT,
  buildPaginatedResult,
  buildSearchRegex,
  buildSortObject,
  escapeSearchTerm,
  parseListQuery,
} from '../../../../src/common/pagination';

const SORTABLE_FIELDS = ['email', 'username', 'createdAt'] as const;

const parse = (raw: Record<string, unknown>) =>
  parseListQuery(raw, { sortableFields: SORTABLE_FIELDS });

describe('parseListQuery', () => {
  test('should apply defaults when the query is empty', () => {
    const query = parse({});

    assert.strictEqual(query.page, 1);
    assert.strictEqual(query.limit, DEFAULT_LIST_LIMIT);
    assert.deepStrictEqual(query.sort, { ...DEFAULT_LIST_SORT });
    assert.strictEqual(query.q, undefined);
  });

  test('should honour the default limit of the resource', () => {
    const query = parseListQuery(
      {},
      { sortableFields: SORTABLE_FIELDS, defaultLimit: 5 },
    );

    assert.strictEqual(query.limit, 5);
  });

  test('should clamp a non positive default limit to a single item', () => {
    for (const defaultLimit of [0, -10]) {
      const query = parseListQuery(
        {},
        { sortableFields: SORTABLE_FIELDS, defaultLimit },
      );

      assert.strictEqual(query.limit, 1);
      assert.strictEqual(
        parseListQuery(
          { limit: '5' },
          { sortableFields: SORTABLE_FIELDS, defaultLimit },
        ).limit,
        5,
      );
    }
  });

  test('should parse page, limit and search term', () => {
    const query = parse({ page: '3', limit: '25', q: '  ali  ' });

    assert.strictEqual(query.page, 3);
    assert.strictEqual(query.limit, 25);
    assert.strictEqual(query.q, 'ali');
  });

  test('should drop blank search terms', () => {
    assert.strictEqual(parse({ q: '   ' }).q, undefined);
    assert.strictEqual(parse({ q: '' }).q, undefined);
  });

  test('should clamp the limit to the maximum page size', () => {
    assert.strictEqual(parse({ limit: '1000' }).limit, MAX_LIST_LIMIT);
    assert.strictEqual(
      parseListQuery({}, { sortableFields: SORTABLE_FIELDS, defaultLimit: 500 })
        .limit,
      MAX_LIST_LIMIT,
    );
  });

  test('should reject an invalid page', () => {
    for (const page of ['0', '-1', 'abc', '1.5', '', ['1', '2'], {}]) {
      assert.throws(() => parse({ page }), InvalidArgumentError);
    }
  });

  test('should reject an invalid limit', () => {
    for (const limit of ['0', '-1', 'abc', '2.5', '', ['10'], {}]) {
      assert.throws(() => parse({ limit }), InvalidArgumentError);
    }
  });

  test('should reject repeated search terms', () => {
    assert.throws(() => parse({ q: ['a', 'b'] }), InvalidArgumentError);
  });

  test('should parse sort directions', () => {
    assert.deepStrictEqual(parse({ sort: 'email' }).sort, {
      field: 'email',
      direction: 1,
    });
    assert.deepStrictEqual(parse({ sort: '-email' }).sort, {
      field: 'email',
      direction: -1,
    });
    assert.deepStrictEqual(parse({ sort: 'username:desc' }).sort, {
      field: 'username',
      direction: -1,
    });
    assert.deepStrictEqual(parse({ sort: 'createdAt:asc' }).sort, {
      field: 'createdAt',
      direction: 1,
    });
  });

  test('should apply the default stable order when sort is absent', () => {
    assert.deepStrictEqual(parse({}).sort, {
      field: 'createdAt',
      direction: -1,
    });
  });

  test('should reject sorts outside the whitelist', () => {
    for (const sort of ['password', '-password', 'email:sideways', 'email:']) {
      assert.throws(() => parse({ sort }), InvalidArgumentError);
    }
  });

  test('should accept a custom default sort', () => {
    const query = parseListQuery(
      {},
      {
        sortableFields: SORTABLE_FIELDS,
        defaultSort: { field: 'email', direction: 1 },
      },
    );

    assert.deepStrictEqual(query.sort, { field: 'email', direction: 1 });
  });

  test('should require the default sort to be a sortable field', () => {
    const sortableFields = ['email'] as const;

    assert.throws(
      () => parseListQuery({}, { sortableFields }),
      /Default sort field "createdAt" is not part of sortableFields/,
    );
    assert.throws(
      () => parseListQuery({ sort: 'email' }, { sortableFields }),
      /Default sort field "createdAt" is not part of sortableFields/,
    );
    assert.deepStrictEqual(
      parseListQuery(
        {},
        { sortableFields, defaultSort: { field: 'email', direction: 1 } },
      ).sort,
      { field: 'email', direction: 1 },
    );
  });
});

describe('escapeSearchTerm', () => {
  test('should escape regular expression metacharacters', () => {
    assert.strictEqual(escapeSearchTerm('a.*('), 'a\\.\\*\\(');
  });

  test('should leave plain terms untouched', () => {
    assert.strictEqual(escapeSearchTerm('alice'), 'alice');
  });
});

describe('buildSearchRegex', () => {
  test('should build an anchored case insensitive pattern', () => {
    const regex = buildSearchRegex('ali');

    assert.strictEqual(regex.source, '^ali');
    assert.ok(regex.flags.includes('i'));
    assert.ok(regex.test('Alice'));
    assert.ok(!regex.test('Malice'));
  });

  test('should match metacharacters literally', () => {
    const regex = buildSearchRegex('a.*(');

    assert.ok(regex.test('a.*(example'));
    assert.ok(!regex.test('abc'));
  });
});

describe('buildSortObject', () => {
  test('should append the _id tiebreak to keep the order stable', () => {
    assert.deepStrictEqual(buildSortObject({ field: 'email', direction: 1 }), {
      email: 1,
      _id: 1,
    });
  });

  test('should not duplicate the tiebreak when sorting by _id', () => {
    assert.deepStrictEqual(buildSortObject({ field: '_id', direction: -1 }), {
      _id: -1,
    });
  });
});

describe('buildPaginatedResult', () => {
  test('should build the envelope from the items and the total', () => {
    const result = buildPaginatedResult(['a', 'b'], 7, { page: 2, limit: 2 });

    assert.deepStrictEqual(result, {
      items: ['a', 'b'],
      total: 7,
      page: 2,
      limit: 2,
    });
  });

  test('should keep an empty page consistent', () => {
    const result = buildPaginatedResult([], 0, { page: 1, limit: 20 });

    assert.deepStrictEqual(result, {
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });
});
