import { describe, expect, it } from 'vitest';
import { DuplicateUpdateError, hashOf, orderUpdates, planUpdates, type UpdateFile } from '../../src/core/sync/updates';
import { prFilePath } from '../../src/core/sync/pr-name';
import { idCollisions, insertedIds, prBody, type IdSearch } from '../../src/core/sync/pr-checks';

const f = (name: string, state: UpdateFile['state'] = 'RELEASED', dir = 'd'): UpdateFile => ({ name, path: `${dir}/${name}`, state });

describe('update order', () => {
  it('orders by file name over every folder together, as the server does', () => {
    const files = [f('rev_20261030_40_x.sql', 'PENDING'), f('2026_08_22_03.sql'), f('2026_09_16_00_mod.sql', 'MODULE'), f('01_base.sql', 'MODULE')];
    expect(orderUpdates(files).map((x) => x.name)).toEqual(['01_base.sql', '2026_08_22_03.sql', '2026_09_16_00_mod.sql', 'rev_20261030_40_x.sql']);
  });

  it('refuses two files of one name', () => {
    expect(() => orderUpdates([f('a.sql', 'RELEASED', 'one'), f('a.sql', 'MODULE', 'two')])).toThrow(DuplicateUpdateError);
  });
});

describe('update selection', () => {
  const hashes: Record<string, string> = { 'a.sql': 'H1', 'b.sql': 'H2', 'c.sql': 'H3', 'new_name.sql': 'H9' };
  const hash = (file: UpdateFile): string => hashes[file.name]!;

  it('runs what is not recorded, and what is recorded with another hash, in order', () => {
    const plan = planUpdates([f('c.sql'), f('b.sql'), f('a.sql')], new Map([['a.sql', 'H1'], ['b.sql', 'OLD']]), hash);
    expect(plan.apply.map((p) => [p.file.name, p.why])).toEqual([['b.sql', 'changed'], ['c.sql', 'new']]);
    expect(plan.renames).toEqual([]);
  });

  it('treats a new name with a recorded hash whose own file is gone as a rename, and a still-present original as new', () => {
    const renamed = planUpdates([f('new_name.sql')], new Map([['old_name.sql', 'H9']]), hash);
    expect(renamed.renames.map((r) => [r.from, r.file.name])).toEqual([['old_name.sql', 'new_name.sql']]);
    expect(renamed.apply).toEqual([]);
    hashes['old_name.sql'] = 'H9';
    const copy = planUpdates([f('new_name.sql'), f('old_name.sql')], new Map([['old_name.sql', 'H9']]), hash);
    expect(copy.apply.map((p) => p.file.name)).toEqual(['new_name.sql']);
  });

  it('hashes like the server: upper-case SHA1 of the bytes', () => {
    expect(hashOf('abc')).toBe('A9993E364706816ABA3E25717850C26C9CD0D89D');
  });
});

describe('pull request file name', () => {
  const day = '20261030';
  it('takes the next number of that date in main, ignoring other dates and other names', () => {
    const existing = [`rev_${day}_40_a.sql`, `rev_${day}_41_b.sql`, 'rev_20261029_99_c.sql', `zzzz_rev_${day}_100_d.sql`];
    expect(prFilePath(existing, day, 'My Fix')).toEqual({ name: `rev_${day}_42_my_fix.sql`, path: `data/sql/updates/pending_db_world/rev_${day}_42_my_fix.sql`, sequence: 42 });
  });
  it('starts at 01 on a new date', () => {
    expect(prFilePath([`rev_20261029_05_a.sql`], day, 'x').name).toBe(`rev_${day}_01_x.sql`);
  });
});

describe('id collisions', () => {
  const insert = (table: string, row: Record<string, string>) => ({ kind: 'insert' as const, table, row });
  const keys = { gameobject: ['guid'], smart_scripts: ['entryorguid', 'id'] };

  it('takes ids only of tables keyed by one column', () => {
    const ids = insertedIds([insert('gameobject', { guid: '6942020' }), insert('gameobject', { guid: '6942020' }), insert('smart_scripts', { entryorguid: '5', id: '0' })], keys);
    expect(ids).toEqual([{ table: 'gameobject', id: '6942020' }]);
  });

  it('fails an id found in a file that names the table, warns on a distinctive id elsewhere, ignores small ones', async () => {
    const search: IdSearch = {
      grep: async () => [{ file: 'data/sql/updates/db_world/a.sql', id: '6942020' }, { file: 'src/x.cpp', id: '6942021' }, { file: 'src/y.cpp', id: '12' }],
      mentioning: async () => new Set(['data/sql/updates/db_world/a.sql']),
    };
    const out = await idCollisions([{ table: 'gameobject', id: '6942020' }, { table: 'gameobject', id: '6942021' }, { table: 'gameobject', id: '12' }], search);
    expect(out.errors).toEqual(['gameobject id 6942020 is already used in data/sql/updates/db_world/a.sql']);
    expect(out.warnings).toEqual(['gameobject id 6942021 also appears in src/x.cpp']);
  });

  it('describes the tables, ids and row changes in the PR body', () => {
    const body = prBody({
      title: 'Pickups',
      statements: [insert('gameobject', { guid: '1' }), { kind: 'delete', table: 'gameobject', key: { guid: '1' } }, { kind: 'update', table: 'creature_template', key: { entry: '1' }, set: { name: 'x' } }],
      ids: [{ table: 'gameobject', id: '1' }],
      differences: [{ table: 'quest_template', key: 'ID=1', column: null, before: undefined, after: undefined, kind: 'added' }],
      warnings: ['careful'],
    });
    expect(body).toContain('| `gameobject` | 1 | 0 | 1 |');
    expect(body).toContain('| `creature_template` | 0 | 1 | 0 |');
    expect(body).toContain('`quest_template`: 1 added, 0 changed, 0 removed');
    expect(body).toContain('- careful');
    expect(body).not.toMatch(/generated|claude/i);
  });
});
