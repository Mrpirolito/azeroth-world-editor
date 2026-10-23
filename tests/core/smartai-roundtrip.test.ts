import { describe, expect, it } from 'vitest';
import { compileEntities } from '../../src/core/entities/compile';
import { EMPTY_ENTITY_CONTEXT } from '../../src/core/entities/context';
import { existingDrift, existingStatements, readOriginalRows } from '../../src/core/entities/existing';
import { npcFromRows, objectFromRows } from '../../src/core/entities/from-rows';
import { EMPTY_ENTITIES, newNpc, newObject, projectEntitiesSchema, type CustomNpc } from '../../src/core/entities/model';
import { renderPatch } from '../../src/core/export/render-patch';
import { entityIssues } from '../../src/core/entities/validate';
import { applyPatchInMemory } from '../../src/core/roundtrip/apply';
import { SCRIPT_KEYS } from '../../src/core/scripts/context';
import { scriptStatements } from '../../src/core/scripts/statements';
import { loadSchema } from '../../src/core/schema/load';
import { SMART_ROWS_KEY } from '../../src/core/smartai/lock';
import { readSmartScripts, readTexts } from '../../src/core/smartai/read';
import { addCard, addList, addStep, cardsOf, fromRaw, numberOf, removeRow, rowsOfOwner, sameRowSets, withColumn, withColumns, type SmartRow } from '../../src/core/smartai/row';
import { searchSmartScripts } from '../../src/core/smartai/search';
import { validateRows } from '../../src/core/smartai/validate';
import { forkDb } from '../helpers/fixtures';
import type { FakeWorldDb } from '../helpers/fake-world-db';

/** Hogger-shaped rows as AzerothCore stores them: signed owners, links, floats, an action list, a spawn script */
const ROWS: Record<string, string>[] = [
  { entryorguid: '448', source_type: '0', id: '0', link: '0', event_type: '4', event_phase_mask: '0', event_chance: '100', event_flags: '0', action_type: '1', action_param1: '0', action_param2: '3000', target_type: '1', comment: "Hogger - On Aggro - Say Line 0 (it's a 'test')" },
  { entryorguid: '448', source_type: '0', id: '1', link: '0', event_type: '0', event_phase_mask: '1', event_chance: '100', event_flags: '0', event_param1: '2000', event_param2: '5000', event_param3: '10000', event_param4: '15000', action_type: '11', action_param1: '116', action_param2: '0', action_param3: '2', target_type: '2', comment: 'Hogger - In Combat - Cast Frostbolt' },
  { entryorguid: '448', source_type: '0', id: '2', link: '3', event_type: '2', event_phase_mask: '0', event_chance: '100', event_flags: '1', event_param1: '0', event_param2: '30', action_type: '11', action_param1: '133', target_type: '2', comment: 'Hogger - Between 0-30% Health - Cast Fireball' },
  { entryorguid: '448', source_type: '0', id: '3', link: '0', event_type: '61', event_phase_mask: '0', event_chance: '100', event_flags: '0', action_type: '1', action_param1: '1', target_type: '1', comment: 'Hogger - Linked - Say Line 1' },
  { entryorguid: '448', source_type: '0', id: '4', link: '0', event_type: '62', event_param1: '4000', event_param2: '0', action_type: '80', action_param1: '44800', action_param2: '2', action_param3: '0', target_type: '7', comment: 'Hogger - On Gossip Option 0 Selected - Run Script' },
  { entryorguid: '448', source_type: '0', id: '5', link: '0', event_type: '4', event_chance: '60', action_type: '69', action_param1: '1', target_type: '8', target_x: '-8913.23', target_y: '554.633', target_z: '93.2994', target_o: '5.31418', comment: 'Hogger - Flee to a spot' },
  { entryorguid: '44800', source_type: '9', id: '0', link: '0', event_type: '0', event_param1: '0', event_param2: '0', action_type: '1', action_param1: '2', target_type: '1', comment: 'Hogger - Script - Say Line 2' },
  { entryorguid: '44800', source_type: '9', id: '1', link: '0', event_type: '0', event_param1: '3000', event_param2: '3000', action_type: '11', action_param1: '2096', target_type: '7', comment: 'Hogger - Script - Cast Mind Vision' },
  { entryorguid: '-90210', source_type: '0', id: '0', link: '0', event_type: '1', event_param1: '5000', event_param2: '9000', event_param3: '30000', event_param4: '60000', action_type: '5', action_param1: '1', target_type: '1', comment: 'Hogger spawn - Out of Combat - Play emote' },
  // Not Hogger's: another creature, and a list outside his range
  { entryorguid: '449', source_type: '0', id: '0', link: '0', event_type: '6', action_type: '37', target_type: '1', comment: 'someone else' },
  { entryorguid: '99900', source_type: '9', id: '0', link: '0', event_type: '0', action_type: '1', target_type: '1', comment: 'a list of nobody here' },
];
const HOGGER = (rows: readonly Record<string, string | null>[]): Record<string, string | null>[] => rows.filter((r) => ['448', '-90210', '44800'].includes(r.entryorguid!));
// Every sample row has the column defaults the database would give it (a chance of 100)
for (const r of ROWS) r.event_chance ??= '100';

async function database(): Promise<FakeWorldDb> {
  const db = forkDb();
  for (const r of ROWS) db.insert('smart_scripts', r);
  db.insert('creature_template', { entry: '448', name: 'Hogger', subname: '', minlevel: '11', maxlevel: '11', faction: '7', rank: '1', type: '7', npcflag: '1', AIName: 'SmartAI', ScriptName: '' });
  db.insert('creature_template_model', { CreatureID: '448', Idx: '0', CreatureDisplayID: '384', DisplayScale: '1', Probability: '1' });
  db.insert('creature', { guid: '90210', id1: '448', map: '0', position_x: '1', position_y: '2', position_z: '3' });
  db.insert('creature_text', { CreatureID: '448', GroupID: '0', ID: '0', Text: 'Grrrr... me smash!' });
  db.insert('creature_text', { CreatureID: '448', GroupID: '1', ID: '0', Text: 'Yipe!' });
  return db;
}

const asRead = async (db: FakeWorldDb): Promise<SmartRow[]> => (await db.selectRows('smart_scripts', {})).map(fromRaw);

describe('reading a creature\'s SmartAI rows', () => {
  it('finds its own script, its spawn scripts and the action lists it calls, and nothing else', async () => {
    const db = await database();
    const all = await asRead(db);
    const found = await readSmartScripts(db, 'creature', 448, [90210]);
    // Exactly the rows the database holds for it, every column as text
    expect(found.length).toBe(9);
    expect(sameRowSets(found, HOGGER(all))).toBe(true);
    expect(found.every((r) => ['448', '-90210', '44800'].includes(r.entryorguid!))).toBe(true);
  });

  it('follows a list called by a list, wherever its id is', async () => {
    const db = await database();
    db.insert('smart_scripts', { entryorguid: '55500', source_type: '9', id: '0', event_type: '0', action_type: '80', action_param1: '55501', target_type: '1' });
    db.insert('smart_scripts', { entryorguid: '55501', source_type: '9', id: '0', event_type: '0', action_type: '1', target_type: '1' });
    db.insert('smart_scripts', { entryorguid: '448', source_type: '0', id: '9', event_type: '4', action_type: '80', action_param1: '55500', target_type: '1' });
    const found = await readSmartScripts(db, 'creature', 448, [90210]);
    expect(found.map((r) => `${r.entryorguid}/${r.id}`)).toContain('55501/0');
  });

  it('reads the creature text for a text group', async () => {
    expect(await readTexts(await database(), 448)).toEqual([{ group: 0, id: 0, text: 'Grrrr... me smash!' }, { group: 1, id: 0, text: 'Yipe!' }]);
  });
});

describe('a round trip through the project', () => {
  const origin = async (db: FakeWorldDb) => {
    const rows = (await readOriginalRows(db, 'npc', 448))!;
    return { rows, npc: npcFromRows(448, rows, { sharedLoot: 0, spawnCount: 1 }) };
  };

  it('keeps the rows with the entity when it is brought in', async () => {
    const db = await database();
    const { rows } = await origin(db);
    expect(sameRowSets(rows[SMART_ROWS_KEY] as SmartRow[], HOGGER(await asRead(db)))).toBe(true);
  });

  it('writes nothing for rows imported and left as they are (identical rows)', async () => {
    const db = await database();
    const { npc } = await origin(db);
    const opened = { ...npc, smartScripts: (npc.origin.kind === 'existing' ? npc.origin.original[SMART_ROWS_KEY]! : []).map((r) => ({ ...r })) };
    const { apply, revert } = existingStatements({ ...EMPTY_ENTITIES, npcs: [opened] }, []);
    expect(apply.filter((s) => s.table === 'smart_scripts')).toEqual([]);
    expect(revert.filter((s) => s.table === 'smart_scripts')).toEqual([]);
    // And leaving them alone (null) writes nothing either
    expect(existingStatements({ ...EMPTY_ENTITIES, npcs: [npc] }, []).apply.filter((s) => s.table === 'smart_scripts')).toEqual([]);
  });

  it('turns an edit into a delete and insert of the scripts, and the revert puts the database\'s rows back', async () => {
    const db = await database();
    const { npc } = await origin(db);
    const rows = (npc.origin.kind === 'existing' ? npc.origin.original[SMART_ROWS_KEY]! : []).map((r) => ({ ...r }));
    const edited = rows.map((r) => (r.entryorguid === '448' && r.id === '1' ? withColumn(r, 'action_param1', 118) : r));
    const { apply, revert } = existingStatements({ ...EMPTY_ENTITIES, npcs: [{ ...npc, smartScripts: edited }] }, []);
    const script = (list: typeof apply) => list.filter((s) => s.table === 'smart_scripts');
    expect(script(apply).filter((s) => s.kind === 'delete').map((s) => (s as { key: object }).key)).toEqual([
      { entryorguid: '448', source_type: '0' }, { entryorguid: '-90210', source_type: '0' }, { entryorguid: '44800', source_type: '9' },
    ]);
    expect(script(apply).filter((s) => s.kind === 'insert')).toHaveLength(9);

    // Apply, then revert, on a copy of the table: the database is back exactly as it was
    const before = { smart_scripts: await db.selectRows('smart_scripts', {}) };
    const applied = applyPatchInMemory(before, apply, SCRIPT_KEYS);
    const changed = applied.smart_scripts!.find((r) => r.entryorguid === '448' && r.id === '1')!;
    expect(changed.action_param1).toBe('118');
    expect(applied.smart_scripts!.find((r) => r.entryorguid === '449')).toBeDefined();
    const reverted = applyPatchInMemory(applied, revert, SCRIPT_KEYS);
    expect(sameRowSets(reverted.smart_scripts!, before.smart_scripts)).toBe(true);
  });

  it('removes a script by deleting its key, and the revert brings it back', async () => {
    const db = await database();
    const { npc } = await origin(db);
    const rows = (npc.origin.kind === 'existing' ? npc.origin.original[SMART_ROWS_KEY]! : []).filter((r) => r.source_type !== '9');
    const { apply, revert } = existingStatements({ ...EMPTY_ENTITIES, npcs: [{ ...npc, smartScripts: rows }] }, []);
    const before = { smart_scripts: await db.selectRows('smart_scripts', {}) };
    const applied = applyPatchInMemory(before, apply, SCRIPT_KEYS);
    expect(applied.smart_scripts!.some((r) => r.source_type === '9' && r.entryorguid === '44800')).toBe(false);
    expect(applied.smart_scripts!.some((r) => r.entryorguid === '99900')).toBe(true);
    expect(sameRowSets(applyPatchInMemory(applied, revert, SCRIPT_KEYS).smart_scripts!, before.smart_scripts)).toBe(true);
  });

  it('renders SQL with the columns the database has, quotes included', async () => {
    const db = await database();
    const { npc } = await origin(db);
    const rows = (npc.origin.kind === 'existing' ? npc.origin.original[SMART_ROWS_KEY]! : []).map((r) => ({ ...r }));
    const edited = [...rows.slice(1), withColumn(rows[0]!, 'comment', "It's changed")];
    const { apply } = existingStatements({ ...EMPTY_ENTITIES, npcs: [{ ...npc, smartScripts: edited }] }, []);
    const schema = await loadSchema(db, ['smart_scripts']);
    const sql = renderPatch(apply.filter((s) => s.table === 'smart_scripts'), schema, { toolVersion: 'test', label: 'smartai', date: '20260101' });
    expect(sql).toContain('DELETE FROM `smart_scripts` WHERE `entryorguid` = 448 AND `source_type` = 0;');
    expect(sql).toContain('DELETE FROM `smart_scripts` WHERE `entryorguid` = -90210 AND `source_type` = 0;');
    expect(sql).toMatch(/INSERT INTO `smart_scripts`/);
    expect(sql).toContain("It\\'s changed");
    expect(sql).toContain('-8913.23');
  });

  it('sets the AI name when rows are written for an NPC without one, and leaves another AI alone', async () => {
    const db = await database();
    db.update('creature_template', { entry: '448' }, { AIName: '' });
    const { npc } = await origin(db);
    const opened = { ...npc, smartScripts: [] as SmartRow[] };
    const nameOf = (n: CustomNpc) => (existingStatements({ ...EMPTY_ENTITIES, npcs: [n] }, []).apply.find((s) => s.kind === 'insert' && s.table === 'creature_template') as { row: Record<string, string> } | undefined)?.row.AIName;
    // Nothing to run, nothing changed
    expect(nameOf(opened)).toBeUndefined();
    const [first] = addCard([], 448, 0).rows;
    expect(nameOf({ ...opened, smartScripts: [first!] })).toBe('SmartAI');
    db.update('creature_template', { entry: '448' }, { AIName: 'ReactorAI' });
    const other = await origin(db);
    expect(existingStatements({ ...EMPTY_ENTITIES, npcs: [{ ...other.npc, smartScripts: [first!] }] }, []).apply.filter((s) => s.table === 'smart_scripts')).toEqual([]);
  });

  it('writes nothing for an entity brought in before its rows were read', async () => {
    const db = await database();
    const { rows } = await origin(db);
    const { [SMART_ROWS_KEY]: _unread, ...old } = rows;
    const npc = npcFromRows(448, old, { sharedLoot: 0, spawnCount: 1 });
    const [first] = addCard([], 448, 0).rows;
    expect(existingStatements({ ...EMPTY_ENTITIES, npcs: [{ ...npc, smartScripts: [first!] }] }, []).apply.filter((s) => s.table === 'smart_scripts')).toEqual([]);
  });

  it('notices when the database changes a script behind the project\'s back', async () => {
    const db = await database();
    const { npc } = await origin(db);
    expect(await existingDrift(db, { ...EMPTY_ENTITIES, npcs: [npc] })).toEqual([]);
    db.update('smart_scripts', { entryorguid: '44800', id: '1' }, { action_param1: '1' });
    expect(await existingDrift(db, { ...EMPTY_ENTITIES, npcs: [npc] })).toEqual([{ kind: 'npc', entry: 448, name: 'Hogger' }]);
  });

  it('does the same for a game object', async () => {
    const db = await database();
    db.insert('gameobject_template', { entry: '2000', name: 'Lever', type: '10', AIName: '' });
    db.insert('smart_scripts', { entryorguid: '2000', source_type: '1', id: '0', event_type: '64', action_type: '9', target_type: '1', comment: 'Lever - use' });
    db.insert('smart_scripts', { entryorguid: '200000', source_type: '9', id: '0', event_type: '0', action_type: '1', target_type: '1' });
    const rows = (await readOriginalRows(db, 'object', 2000))!;
    expect((rows[SMART_ROWS_KEY] as SmartRow[]).map((r) => `${r.entryorguid}/${r.source_type}`)).toEqual(['2000/1', '200000/9']);
    const object = objectFromRows(2000, rows, { sharedLoot: 0, spawnCount: 0 });
    expect(object.smartScripts).toBeNull();
    const opened = { ...object, smartScripts: (rows[SMART_ROWS_KEY] as SmartRow[]).map((r) => ({ ...r })) };
    expect(existingStatements({ ...EMPTY_ENTITIES, objects: [opened] }, []).apply.filter((s) => s.table === 'smart_scripts')).toEqual([]);
    const edited = { ...opened, smartScripts: opened.smartScripts.map((r) => withColumn(r, 'action_type', 49)) };
    const { apply } = existingStatements({ ...EMPTY_ENTITIES, objects: [edited] }, []);
    expect(apply.filter((s) => s.table === 'smart_scripts' && s.kind === 'delete')).toHaveLength(2);
    expect((apply.find((s) => s.kind === 'insert' && s.table === 'gameobject_template') as { row: Record<string, string> }).row.AIName).toBe('SmartGameObjectAI');
  });
});

describe('a new NPC or object with SmartAI rows', () => {
  it('compiles the rows to inserts after deleting the scripts they name, and sets the AI name', async () => {
    const rows = HOGGER(ROWS).map((r) => ({ ...r, comment: r.comment ?? '' }));
    const npc = { ...newNpc(12000001), name: 'Scout', smartScripts: rows };
    const out = compileEntities({ entities: { npcs: [npc], objects: [], items: [] }, givers: [], context: EMPTY_ENTITY_CONTEXT });
    expect(out.inserts.smart_scripts).toHaveLength(9);
    expect(out.inserts.smart_scripts![5]).toMatchObject({ target_x: '-8913.23', target_o: '5.31418' });
    expect(out.deletes.smart_scripts).toEqual([
      { entryorguid: '448', source_type: '0' }, { entryorguid: '44800', source_type: '9' }, { entryorguid: '-90210', source_type: '0' },
    ]);
    expect(out.inserts.creature_template![0]).toMatchObject({ AIName: 'SmartAI' });
    const db = await database();
    const schema = await loadSchema(db, ['smart_scripts', 'creature_template']);
    const { statements } = scriptStatements(out, schema);
    expect(statements.filter((s) => s.table === 'smart_scripts' && s.kind === 'insert')).toHaveLength(9);
    expect(statements.find((s) => s.table === 'smart_scripts' && s.kind === 'insert')).toMatchObject({ row: expect.objectContaining({ link: '0', event_param5: '0' }) });
  });

  it('writes nothing for rows when the project holds none (null), and uses SmartGameObjectAI for an object', () => {
    const none = compileEntities({ entities: { npcs: [{ ...newNpc(12000001), name: 'Scout' }], objects: [], items: [] }, givers: [], context: EMPTY_ENTITY_CONTEXT });
    expect(none.inserts.smart_scripts).toBeUndefined();
    const object = { ...newObject(9100001), name: 'Lever', smartScripts: [withColumns(addCard([], 9100001, 1).added, { action_type: 9 })] };
    const out = compileEntities({ entities: { npcs: [], objects: [object], items: [] }, givers: [], context: EMPTY_ENTITY_CONTEXT });
    expect(out.inserts.gameobject_template![0]).toMatchObject({ AIName: 'SmartGameObjectAI' });
    expect(out.inserts.smart_scripts).toHaveLength(1);
  });

  it('survives the project file: the rows are saved with the entity', () => {
    const rows = HOGGER(ROWS);
    const parsed = projectEntitiesSchema.parse({ npcs: [{ ...newNpc(1), smartScripts: rows }], objects: [{ ...newObject(2), smartScripts: null }], items: [] });
    expect(parsed.npcs[0]!.smartScripts).toEqual(rows);
    expect(parsed.objects[0]!.smartScripts).toBeNull();
    // Saved before the editor: no field at all reads as "leave the database alone"
    const { smartScripts: _drop, ...old } = newNpc(3);
    expect(projectEntitiesSchema.parse({ npcs: [old], objects: [], items: [] }).npcs[0]!.smartScripts).toBeNull();
  });
});

describe('editing rows as cards', () => {
  const hogger = HOGGER(ROWS).map(fromRaw);

  it('chains a row to the rows it links to, in order, and shows every row once', () => {
    const cards = cardsOf(rowsOfOwner(hogger, 448, 0));
    expect(cards.map((c) => c.rows.map((r) => r.id))).toEqual([['0'], ['1'], ['2', '3'], ['4'], ['5']]);
  });

  it('adds a linked step after a card, and removes one without breaking the chain', () => {
    const head = hogger.find((r) => r.entryorguid === '448' && r.id === '0')!;
    const added = addStep(hogger, head);
    expect(added.added).toMatchObject({ id: '6', event_type: '61', link: '0' });
    expect(added.rows.find((r) => r.entryorguid === '448' && r.id === '0')).toMatchObject({ link: '6' });
    const middle = hogger.find((r) => r.entryorguid === '448' && r.id === '2')!;
    const tail = hogger.find((r) => r.entryorguid === '448' && r.id === '3')!;
    expect(removeRow(hogger, tail).find((r) => r.entryorguid === '448' && r.id === '2')).toMatchObject({ link: '0' });
    const one = addStep(hogger, tail);
    const two = addStep(one.rows, one.added);
    expect(cardsOf(rowsOfOwner(two.rows, 448, 0)).find((c) => c.rows[0] === middle || numberOf(c.rows[0]!, 'id') === 2)!.rows.map((r) => r.id)).toEqual(['2', '3', '6', '7']);
    const six = two.rows.find((r) => r.entryorguid === '448' && r.id === '6')!;
    expect(numberOf(removeRow(two.rows, six).find((r) => r.entryorguid === '448' && r.id === '3')!, 'link')).toBe(7);
  });

  it('adds action lists as scripts of their own', () => {
    const list = addList(hogger, 44801);
    expect(list.added).toMatchObject({ entryorguid: '44801', source_type: '9', id: '0', event_type: '0' });
  });
});

describe('checking rows', () => {
  const messages = (rows: SmartRow[], ctx = {}) => validateRows(rows, ctx).map((i) => `${i.level}: ${i.message}`);
  const row = (over: Record<string, string | number>) => withColumns(addCard([], 448, 0).added, over);

  it('finds nothing wrong with real rows', () => {
    expect(validateRows(HOGGER(ROWS).map(fromRaw), { textGroups: new Set([0, 1, 2]) })).toEqual([]);
  });

  it('refuses what the server refuses', () => {
    expect(messages([row({ event_type: 999 })])).toContain('error: There is no event type 999.');
    expect(messages([row({ action_type: 999 })])).toContain('error: There is no action type 999.');
    expect(messages([row({ event_chance: 140 })])).toContain('error: The chance must be from 0 to 100.');
    expect(messages([row({ event_phase_mask: 5000 })])).toContain('error: The phase mask can only name phases 1 to 12 (up to 4095).');
    expect(messages([row({ event_type: 4 }), row({ event_type: 4 })])).toContain('error: Another row has the same id and link in this script; the database can only hold one.');
    expect(messages([row({ link: 7 })])).toContain('error: It links to row 7, which this script does not have.');
    expect(messages([row({ event_type: 70 })])).toContain('error: "The object changes state" cannot be used in this kind of script.');
    expect(messages([row({ event_type: 0, event_param1: 5000, event_param2: 1000 })])).toContain('error: First fire: at least is more than first fire: at most.');
    expect(messages([row({ action_type: 80, action_param1: 1, action_param3: 3 })])).toContain('error: Replace the running list must be 0 or 1; the server skips the row otherwise.');
  });

  it('warns about what loads but is probably not meant', () => {
    expect(messages([row({ event_type: 61 })])).toContain('warning: Nothing links to this row, so it never runs.');
    expect(messages([row({ action_type: 11, action_param1: 99999 })], { exists: () => false })).toContain('warning: Spell: the database has no spell 99999.');
    expect(messages([row({ action_type: 1, action_param1: 7 })], { textGroups: new Set([0]) })).toContain('warning: The creature has no text group 7 in creature_text.');
    expect(messages([row({ action_type: 80, action_param1: 5 })])).toContain('warning: Action list 5 has no rows here.');
    expect(messages([row({ action_type: 24, action_param3: 4 })])).toContain('warning: Evade (reset) does not use parameter 3, so 4 here is ignored.');
    expect(messages([row({ target_type: 8 })])).toContain('warning: The target is a position but its coordinates are all 0.');
    expect(messages([row({ event_chance: 0 })])).toContain('warning: A chance of 0 means the event never fires.');
  });
});

describe('finding who uses something', () => {
  it('finds the rows that run an action, name a spell, or say a text group', async () => {
    const db = await database();
    const spell = await searchSmartScripts(db, { spell: 116 });
    expect(spell.hits.map((h) => `${h.entryorguid}/${h.id}`)).toEqual(['448/1']);
    expect(spell.hits[0]).toMatchObject({ owner: { kind: 'creature', entry: 448 }, sentence: 'On a timer while in combat (in phase 1): cast spell 116, on its current target' });
    const talks = await searchSmartScripts(db, { action: 1 });
    expect(talks.hits.map((h) => `${h.entryorguid}/${h.sourceType}/${h.id}`)).toEqual(['448/0/0', '448/0/3', '44800/9/0', '99900/9/0']);
    const group = await searchSmartScripts(db, { textGroup: 2, entry: 448 });
    expect(group.hits.map((h) => `${h.entryorguid}/${h.id}`)).toEqual(['44800/0']);
    expect(group.hits[0]!.owner).toEqual({ kind: 'creature', entry: 448 });
  });

  it('ANDs the filters and finds spells in events and targets too', async () => {
    const db = await database();
    db.insert('smart_scripts', { entryorguid: '500', source_type: '0', id: '0', event_type: '8', event_param1: '116', action_type: '1', target_type: '1' });
    db.insert('smart_scripts', { entryorguid: '501', source_type: '0', id: '0', event_type: '4', action_type: '11', action_param1: '7', target_type: '201', target_param1: '116' });
    const both = await searchSmartScripts(db, { spell: 116, action: 11 });
    expect(both.hits.map((h) => h.entryorguid)).toEqual([448, 501]);
    expect((await searchSmartScripts(db, { spell: 116, event: 8 })).hits.map((h) => h.entryorguid)).toEqual([500]);
    expect(await searchSmartScripts(db, { spell: 4242 })).toEqual({ hits: [], capped: false });
    expect(await searchSmartScripts(db, {})).toEqual({ hits: [], capped: false });
  });
});

describe('checking the project\'s NPCs', () => {
  const issuesOf = (npc: CustomNpc) => entityIssues({ entities: { npcs: [npc], objects: [], items: [] }, dbNames: new Map() }).filter((i) => i.code.startsWith('SMARTAI'));

  it('refuses rows that belong to something else, and rows the server would refuse', () => {
    const own = withColumns(addCard([], 12000001, 0).added, { action_type: 1 });
    const npc = { ...newNpc(12000001), name: 'Scout', displayId: 5, smartScripts: [own, withColumn(own, 'entryorguid', 448), withColumns(own, { id: 1, event_chance: 300 })] };
    const issues = issuesOf(npc);
    expect(issues.map((i) => `${i.severity} ${i.code}`)).toEqual(['error SMARTAI_FOREIGN', 'error SMARTAI_ROW']);
    expect(issues[0]!.message).toBe('NPC "Scout": 1 SmartAI row is for something else (448/0), which this npc cannot write.');
    expect(issues[1]!.message).toBe('NPC "Scout": SmartAI row 12000001/0/1: The chance must be from 0 to 100.');
  });

  it('leaves rows alone that are as the database has them, however odd they are', async () => {
    const db = await database();
    db.insert('smart_scripts', { entryorguid: '448', source_type: '0', id: '40', link: '99', event_type: '4', event_chance: '100', action_type: '1', target_type: '1' });
    const rows = (await readOriginalRows(db, 'npc', 448))!;
    const npc = npcFromRows(448, rows, { sharedLoot: 0, spawnCount: 1 });
    const opened = { ...npc, smartScripts: (rows[SMART_ROWS_KEY] as SmartRow[]).map((r) => ({ ...r })) };
    expect(issuesOf(opened)).toEqual([]);
    expect(issuesOf({ ...opened, smartScripts: opened.smartScripts.map((r) => withColumn(r, 'comment', 'edited')) }).map((i) => i.message)).toEqual([
      'NPC "Hogger": SmartAI row 448/0/40: It links to row 99, which this script does not have.',
    ]);
  });
});
