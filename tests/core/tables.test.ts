import { describe, expect, it } from 'vitest';
import { existingStatements } from '../../src/core/entities/existing';
import { compileEntities } from '../../src/core/entities/compile';
import { EMPTY_ENTITY_CONTEXT } from '../../src/core/entities/context';
import { npcFromRows, objectFromRows } from '../../src/core/entities/from-rows';
import { EMPTY_ENTITIES, newNpc, newObject, projectEntitiesSchema, readProjectEntities } from '../../src/core/entities/model';
import { entityIssues } from '../../src/core/entities/validate';
import { findSet, overlayColumns, rowsetIssues, rowsetStatements, sameRowList, setSummary, withoutOwner, withSet } from '../../src/core/tables/rowset';
import { SPECS, specOf } from '../../src/core/tables/specs';
import type { Row, RowSet } from '../../src/core/tables/types';
import { loadFork } from '../helpers/ddl';

const spec = (table: string) => specOf(table)!;
const set = (table: string, scope: Record<string, string>, original: Row[], rows: Row[], owner?: RowSet['owner']): RowSet => ({ table, scope, original, rows, ...(owner ? { owner } : {}) });

const UNIQUE_KEY_ONLY = new Set(['spell_linked_spell', 'spell_script_names']);

describe('table specs against the fork\'s schema', () => {
  const columns = loadFork(SPECS.map((s) => s.table));
  it.each(SPECS.map((s) => [s.table, s] as const))('%s: scope, key and fields are columns of the table', (table, s) => {
    const names = columns[table]!.map((c) => c.name);
    for (const c of [...s.scope, ...s.pk]) expect(names, `${table}.${c}`).toContain(c);
    for (const f of s.fields) expect(names, `${table}.${f.column}`).toContain(f.column);

  });
  it.each(SPECS.filter((s) => !s.overlay).map((s) => [s.table, s] as const))('%s: its key is the table\'s primary key', (table, s) => {
    // These two have only a unique key (no primary key): the sheet deletes and writes rows by it
    if (UNIQUE_KEY_ONLY.has(table)) return;
    expect(columns[table]!.filter((c) => c.isKey).map((c) => c.name).sort()).toEqual([...s.pk].sort());
  });
  it('gives every table a title and a sentence', () => {
    for (const s of SPECS) {
      expect(s.title.length).toBeGreaterThan(2);
      expect(s.blurb.endsWith('.')).toBe(true);
    }
  });
});

describe('rowsetStatements', () => {
  const addon: Row = { entry: '1423', path_id: '0', mount: '0', bytes1: '0', bytes2: '1', emote: '0', visibilityDistanceType: '0', auras: '25 8' };
  it('writes nothing for rows left as the database has them, in any order', () => {
    const res: Row[] = [{ CreatureID: '1423', School: '2', Resistance: '10', VerifiedBuild: '12340' }, { CreatureID: '1423', School: '4', Resistance: '5', VerifiedBuild: '12340' }];
    expect(rowsetStatements([set('creature_template_resistance', { CreatureID: '1423' }, res, [res[1]!, res[0]!])])).toEqual({ apply: [], revert: [] });
  });
  it('deletes by primary key and writes the held rows; the revert puts the originals back', () => {
    const next = { ...addon, auras: '25', bytes1: '3' };
    const { apply, revert } = rowsetStatements([set('creature_template_addon', { entry: '1423' }, [addon], [next])]);
    expect(apply).toEqual([{ kind: 'delete', table: 'creature_template_addon', key: { entry: '1423' } }, { kind: 'insert', table: 'creature_template_addon', row: next }]);
    expect(revert).toEqual([{ kind: 'delete', table: 'creature_template_addon', key: { entry: '1423' } }, { kind: 'insert', table: 'creature_template_addon', row: addon }]);
  });
  it('deletes only the keys of its own rows, so other writers\' rows under the scope survive', () => {
    const was: Row[] = [{ CreatureID: '7', GroupID: '0', ID: '0', Text: 'Hello', Type: '12', Language: '0', Probability: '100', Emote: '0', Duration: '0', Sound: '0', BroadcastTextId: '0', TextRange: '0', comment: '' }];
    const now: Row[] = [{ ...was[0]!, Text: 'Hi' }, { ...was[0]!, ID: '1', Text: 'Again' }];
    const { apply } = rowsetStatements([set('creature_text', { CreatureID: '7' }, was, now)]);
    expect(apply.filter((s) => s.kind === 'delete')).toEqual([
      { kind: 'delete', table: 'creature_text', key: { CreatureID: '7', GroupID: '0', ID: '0' } },
      { kind: 'delete', table: 'creature_text', key: { CreatureID: '7', GroupID: '0', ID: '1' } },
    ]);
  });
  it('removes the rows of a key the author took out', () => {
    const was: Row[] = [{ Entry: '9', Item: '1', Reference: '0', Chance: '50', QuestRequired: '0', LootMode: '1', GroupId: '0', MinCount: '1', MaxCount: '1', Comment: null }];
    const { apply, revert } = rowsetStatements([set('skinning_loot_template', { Entry: '9' }, was, [])]);
    expect(apply).toEqual([{ kind: 'delete', table: 'skinning_loot_template', key: { Entry: '9', Item: '1' } }]);
    expect(revert).toEqual([{ kind: 'delete', table: 'skinning_loot_template', key: { Entry: '9', Item: '1' } }, { kind: 'insert', table: 'skinning_loot_template', row: was[0] }]);
  });
  it('forces the scope into every row and keeps NULL', () => {
    const { apply } = rowsetStatements([set('creature_template_movement', { CreatureId: '5' }, [], [{ Ground: '1', Swim: null, InteractionPauseTimer: null }])]);
    expect(apply).toContainEqual({ kind: 'insert', table: 'creature_template_movement', row: { CreatureId: '5', Ground: '1', Swim: null, InteractionPauseTimer: null } });
  });
  it('skips a set with no spec and a template overlay (written on the template row)', () => {
    expect(rowsetStatements([set('nothing', { a: '1' }, [], [{ a: '1' }]), set('creature_template', { entry: '1' }, [{ entry: '1' }], [{ entry: '1', speed_run: '2' }])])).toEqual({ apply: [], revert: [] });
  });
});

describe('withSet and friends', () => {
  const a: Row = { entry: '1', path_id: '0' };
  it('drops a set that is back to the database\'s rows and replaces the one of its key', () => {
    const one = withSet(undefined, set('creature_template_addon', { entry: '1' }, [a], [{ ...a, path_id: '5' }]));
    expect(one).toHaveLength(1);
    expect(withSet(one, set('creature_template_addon', { entry: '1' }, [a], [a]))).toEqual([]);
    expect(withSet(one, set('creature_template_addon', { entry: '1' }, [a], [{ ...a, path_id: '6' }]))).toHaveLength(1);
    expect(findSet(one, 'creature_template_addon', { entry: '1' })?.rows[0]?.path_id).toBe('5');
    expect(findSet(one, 'creature_template_addon', { entry: '2' })).toBeUndefined();
  });
  it('lets an owner take its sets with it', () => {
    const sets = [set('creature_text', { CreatureID: '4' }, [], [{ CreatureID: '4' }], { kind: 'creature', entry: 4 }), set('game_tele', { id: '9' }, [], [{ id: '9' }])];
    expect(withoutOwner(sets, 'creature', 4)).toEqual([sets[1]]);
    expect(withoutOwner(sets, 'item', 4)).toEqual(sets);
  });
  it('compares row lists by value and sums up loot', () => {
    expect(sameRowList([{ a: '1', b: null }], [{ b: null, a: '1' }])).toBe(true);
    expect(sameRowList([{ a: '1' }], [{ a: '2' }])).toBe(false);
    expect(setSummary(spec('skinning_loot_template'), [{ Item: '1', GroupId: '1' }, { Item: '2', GroupId: '1' }, { Item: '0', Reference: '5' }])).toBe('2 items in 1 group, 1 reference.');
    expect(setSummary(spec('creature_template_spell'), [])).toBe('Nothing set.');
  });
});

describe('rowsetIssues', () => {
  const loot = (rows: Row[]) => rowsetIssues([set('skinning_loot_template', { Entry: '9' }, [], rows)]);
  const row = (more: Row): Row => ({ Entry: '9', Item: '5', Reference: '0', Chance: '50', QuestRequired: '0', LootMode: '1', GroupId: '0', MinCount: '1', MaxCount: '1', ...more });
  it('accepts a sound loot list', () => expect(loot([row({}), row({ Item: '6', GroupId: '1', Chance: '60' }), row({ Item: '7', GroupId: '1', Chance: '40' })])).toEqual([]));
  it('refuses an empty row, a swapped count, a chance out of range and a repeated key', () => {
    const codes = loot([row({ Item: '0' }), row({ Item: '8', MinCount: '3', MaxCount: '2' }), row({ Item: '9', Chance: '140' }), row({ Item: '9' })]).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['LOOT_EMPTY', 'LOOT_COUNT', 'LOOT_CHANCE', 'ROWSET_DUPLICATE']));
  });
  it('warns when the chances of a group pass 100', () => {
    expect(loot([row({ GroupId: '2', Chance: '70' }), row({ Item: '6', GroupId: '2', Chance: '50' })]).map((i) => [i.severity, i.code])).toEqual([['warning', 'LOOT_GROUP_SUM']]);
  });
  it('checks numbers, ranges and ids that lead nowhere', () => {
    const issues = rowsetIssues(
      [set('creature_template_spell', { CreatureID: '3' }, [], [{ CreatureID: '3', Index: '9', Spell: 'abc' }]), set('creature_questitem', { CreatureEntry: '3' }, [], [{ CreatureEntry: '3', Idx: '0', ItemId: '404' }])],
      { exists: (kind, id) => !(kind === 'item' && id === 404) },
    );
    expect(issues.map((i) => i.code).sort()).toEqual(['ROWSET_RANGE', 'ROWSET_TYPE', 'ROWSET_UNKNOWN_REF']);
  });
  it('says one row where only one fits, and tags the owner', () => {
    const [issue] = rowsetIssues([set('creature_onkill_reputation', { creature_id: '1' }, [], [{ creature_id: '1' }, { creature_id: '1' }], { kind: 'creature', entry: 1 })]);
    expect(issue).toMatchObject({ code: 'ROWSET_DUPLICATE', about: { kind: 'creature', entry: 1 } });
  });
  it('flows through entityIssues', () => {
    const issues = entityIssues({ entities: { ...EMPTY_ENTITIES, rowsets: [set('skinning_loot_template', { Entry: '9' }, [], [row({ Item: '0' })])] }, dbNames: new Map() });
    expect(issues.map((i) => i.code)).toEqual(['LOOT_EMPTY']);
  });
});

describe('template overlay', () => {
  const template = { entry: '1423', name: 'Stormwind Guard', subname: '', minlevel: '55', maxlevel: '56', faction: '11', rank: '1', type: '7', npcflag: '4097', speed_run: '1.14286', unit_flags: '32768', pickpocketloot: '0', lootid: '0', AIName: '', ScriptName: '', HealthModifier: '1', DamageModifier: '1' };
  const edited = (more: Row): RowSet[] => [set('creature_template', { entry: '1423' }, [template], [{ ...template, ...more }], { kind: 'creature', entry: 1423 })];
  it('is the columns that differ from what the database had', () => {
    expect(overlayColumns(edited({ speed_run: '2', unit_flags: '32768' }), 'creature_template', 1423)).toEqual({ speed_run: '2' });
    expect(overlayColumns(edited({}), 'creature_template', 1423)).toEqual({});
    expect(overlayColumns(undefined, 'creature_template', 1423)).toEqual({});
    expect(overlayColumns(edited({ speed_run: '2' }), 'creature_template_addon', 1423)).toEqual({});
  });
  it('lies over the template row of an existing NPC, whatever the Basics tab wrote, and the rest stays', () => {
    const guard = npcFromRows(1423, { creature_template: [template] }, { sharedLoot: 0, spawnCount: 2 });
    const { apply, revert } = existingStatements({ ...EMPTY_ENTITIES, npcs: [{ ...guard, minLevel: 60 }], rowsets: edited({ speed_run: '2', unit_flags: '33024' }) }, []);
    expect((apply.find((s) => s.kind === 'insert' && s.table === 'creature_template') as any).row).toMatchObject({ minlevel: '60', speed_run: '2', unit_flags: '33024', pickpocketloot: '0' });
    expect(revert).toContainEqual({ kind: 'insert', table: 'creature_template', row: template });
  });
  it('writes the template of an NPC left as read only when an overlay changes it', () => {
    const guard = npcFromRows(1423, { creature_template: [template] }, { sharedLoot: 0, spawnCount: 2 });
    const templateOf = (rowsets?: RowSet[]) => existingStatements({ ...EMPTY_ENTITIES, npcs: [guard], ...(rowsets ? { rowsets } : {}) }, []).apply.filter((s) => s.table === 'creature_template');
    expect(templateOf()).toEqual([]);
    expect(templateOf(edited({ speed_run: '3' }))).toHaveLength(2);
  });
  it('lies over the row of an existing object', () => {
    const chest = objectFromRows(2843, { gameobject_template: [{ entry: '2843', type: '3', displayId: '259', name: 'Chest', size: '1', Data0: '57', Data1: '2843', Data3: '0', IconName: '' }] }, { sharedLoot: 0, spawnCount: 1 });
    const orig = { entry: '2843', type: '3', displayId: '259', name: 'Chest', size: '1', Data0: '57', Data1: '2843', Data3: '0', IconName: '' };
    const { apply } = existingStatements({ ...EMPTY_ENTITIES, objects: [chest], rowsets: [set('gameobject_template', { entry: '2843' }, [orig], [{ ...orig, Data3: '1' }])] }, []);
    expect((apply.find((s) => s.kind === 'insert' && s.table === 'gameobject_template') as any).row).toMatchObject({ Data0: '57', Data1: '2843', Data3: '1' });
  });
  it('lies over the rows of a new NPC and a new object', () => {
    const npc = { ...newNpc(90001), name: 'Guard', displayId: 3167 };
    const object = { ...newObject(90002), name: 'Chest', type: 'chest' as const, displayId: 259 };
    const out = compileEntities({
      entities: { ...EMPTY_ENTITIES, npcs: [npc], objects: [object], rowsets: [set('creature_template', { entry: '90001' }, [], [{ entry: '90001', speed_run: '2', family: null }]), set('gameobject_template', { entry: '90002' }, [], [{ entry: '90002', Data3: '1' }])] },
      givers: [], context: EMPTY_ENTITY_CONTEXT,
    });
    expect(out.inserts.creature_template![0]).toMatchObject({ entry: '90001', speed_run: '2' });
    expect(out.inserts.creature_template![0]).not.toHaveProperty('family');
    expect(out.inserts.gameobject_template![0]).toMatchObject({ entry: '90002', Data3: '1', Data1: '90002' });
  });
});

describe('the store', () => {
  const sets = [set('creature_text', { CreatureID: '4' }, [], [{ CreatureID: '4', GroupID: '0', ID: '0', Text: 'Hi' }], { kind: 'creature', entry: 4 })];
  it('keeps the sets through its schema and its reader, and reads a store saved before them', () => {
    const store = { ...EMPTY_ENTITIES, rowsets: sets };
    expect(projectEntitiesSchema.parse(store).rowsets).toEqual(sets);
    expect(readProjectEntities(JSON.parse(JSON.stringify(store))).rowsets).toEqual(sets);
    expect(readProjectEntities({ npcs: [], objects: [], items: [] }).rowsets).toBeUndefined();
    expect(readProjectEntities({ npcs: [], objects: [], items: [], rowsets: [{ nonsense: true }, ...sets] }).rowsets).toEqual(sets);
  });
});
