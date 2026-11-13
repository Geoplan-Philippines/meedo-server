import {
  escapeLikePattern,
  orderByIds,
  pageArgs,
  searchTerms,
  sqlDirection,
  termSearchWhere,
  toPage,
} from './pagination.util';

describe('pagination helpers', () => {
  it('turns a 1-based page into skip/take', () => {
    expect(pageArgs({ page: 1, limit: 25 })).toEqual({ skip: 0, take: 25 });
    expect(pageArgs({ page: 4, limit: 10 })).toEqual({ skip: 30, take: 10 });
  });

  it('answers with the shared list shape', () => {
    expect(toPage(['a', 'b'], 27, { page: 2, limit: 10 })).toEqual({
      data: ['a', 'b'],
      meta: { total: 27, page: 2, limit: 10, lastPage: 3 },
    });
    expect(toPage([], 0, { page: 1, limit: 10 }).meta).toEqual({ total: 0, page: 1, limit: 10, lastPage: 0 });
  });

  it('splits a search into words and requires every word to match', () => {
    expect(searchTerms('  jane   smith ')).toEqual(['jane', 'smith']);
    expect(searchTerms(undefined)).toEqual([]);
    expect(termSearchWhere(' ', (term) => [{ name: term }])).toEqual({});
    expect(termSearchWhere('jane smith', (term) => [{ first: term }, { last: term }])).toEqual({
      AND: [{ OR: [{ first: 'jane' }, { last: 'jane' }] }, { OR: [{ first: 'smith' }, { last: 'smith' }] }],
    });
  });

  it('escapes LIKE wildcards so raw searches match text literally', () => {
    expect(escapeLikePattern('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('only emits ASC or DESC into raw SQL', () => {
    expect(sqlDirection('desc').sql).toBe('DESC');
    expect(sqlDirection(undefined).sql).toBe('ASC');
    expect(sqlDirection(undefined, 'desc').sql).toBe('DESC');
  });

  it('restores the order a raw query picked and drops ids that vanished', () => {
    const rows = [{ id: 'b' }, { id: 'a' }];
    expect(orderByIds(rows, ['a', 'gone', 'b'])).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
});
