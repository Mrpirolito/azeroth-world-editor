import { describe, expect, it } from 'vitest';
import { fieldIndex, layoutOf } from '../../src/core/game/dbc-formats';
import { newItem } from '../../src/core/entities/model';
import { applyPlan, newDbcIds } from '../../src/core/modelwizard/apply';
import { checkModelFile, newDraft, placeFiles, type WizardDraft } from '../../src/core/modelwizard/model';
import { AURA_MOUNTED, AURA_MOUNTED_FLIGHT_SPEED, AURA_MOUNTED_SPEED, buildPlan, buildSpell, draftIssues, MODEL_FILE, SPELL_LEARNING, SUMMON_PROPERTIES_COMPANION } from '../../src/core/modelwizard/rows';
import { effectOf, spellNum } from '../../src/core/spells/model';

const ids = { modelData: 900, display: 901, creature: 902, spell: 903, item: 904 };
const draft = (kind: WizardDraft['kind'], more: Partial<WizardDraft> = {}): WizardDraft => ({ ...newDraft(kind), name: 'Sun Charger', ...more });
const bytes = (text: string, version = 0): Uint8Array => {
  const b = new Uint8Array(12);
  [...text].forEach((c, i) => { b[i] = c.charCodeAt(0); });
  b[4] = version & 255;
  b[5] = version >> 8;
  return b;
};
const emptyStore = { npcs: [], objects: [], items: [] };

describe('model files', () => {
  it('accepts a WotLK M2 and warns about another version', () => {
    expect(checkModelFile('a.m2', bytes('MD20', 264))).toEqual([]);
    expect(checkModelFile('a.m2', bytes('MD20', 272))[0]).toMatchObject({ severity: 'warning' });
  });
  it('rejects files with the wrong header or extension', () => {
    expect(checkModelFile('a.m2', bytes('XXXX', 264))[0]).toMatchObject({ severity: 'error' });
    expect(checkModelFile('a.skin', bytes('SKIN'))).toEqual([]);
    expect(checkModelFile('a.blp', bytes('BLP1'))[0]).toMatchObject({ severity: 'error' });
    expect(checkModelFile('a.png', bytes('x'))[0]).toMatchObject({ severity: 'error' });
  });
  it('places the files under the name and names the textures', () => {
    const placed = placeFiles('Sun Charger', [{ name: 'horse.m2' }, { name: 'horse00.skin' }, { name: 'a.blp' }, { name: 'b.blp' }]);
    expect(placed.paths).toEqual([
      'Creature\\CoA_SunCharger\\CoA_SunCharger.m2', 'Creature\\CoA_SunCharger\\CoA_SunCharger00.skin',
      'Creature\\CoA_SunCharger\\CoA_SunCharger_Tex1.blp', 'Creature\\CoA_SunCharger\\CoA_SunCharger_Tex2.blp',
    ]);
    expect(placed.textures).toEqual(['CoA_SunCharger_Tex1', 'CoA_SunCharger_Tex2']);
    expect(placed.issues).toEqual([]);
  });
  it('wants exactly one model and at most three textures', () => {
    expect(placeFiles('x', []).issues.some((i) => i.severity === 'error')).toBe(true);
    const many = placeFiles('x', [{ name: 'a.m2' }, ...['1', '2', '3', '4'].map((n) => ({ name: `${n}.blp` }))]);
    expect(many.issues.some((i) => i.severity === 'error')).toBe(true);
  });
});

describe('rows', () => {
  it('builds a mount spell with the mounted aura on the creature and the speed auras', () => {
    const spell = buildSpell(undefined, 903, 902, draft('mount', { speed: 60, flying: true, flightSpeed: 280 }));
    expect(effectOf(spell, 0)).toMatchObject({ effect: 6, aura: AURA_MOUNTED, miscValue: 902 });
    expect(effectOf(spell, 1)).toMatchObject({ aura: AURA_MOUNTED_SPEED, basePoints: 59 });
    expect(effectOf(spell, 2)).toMatchObject({ aura: AURA_MOUNTED_FLIGHT_SPEED, basePoints: 279 });
  });
  it('builds a companion spell as a summon with the companion properties', () => {
    const spell = buildSpell(undefined, 903, 902, draft('companion'));
    expect(effectOf(spell, 0)).toMatchObject({ effect: 28, miscValue: 902, miscValueB: SUMMON_PROPERTIES_COMPANION });
    expect(effectOf(spell, 1).effect).toBe(0);
  });
  it('replaces the effects of a pattern spell and keeps its other fields', () => {
    const pattern = buildSpell(undefined, 1, 1, draft('mount'));
    const changed = buildSpell([...pattern.slice(0, 4), 7, ...pattern.slice(5)], 903, 902, draft('companion'));
    expect(spellNum(changed, 'ID')).toBe(903);
    expect(effectOf(changed, 0).aura).toBe(0);
  });
  it('plans a mount: client rows, creature, spell, learn-on-use item and client item row', () => {
    const plan = buildPlan(draft('mount', { itemDisplayId: 55 }), ids, {}, ['CoA_SunCharger_Tex1']);
    expect(plan.dbc.map((r) => [r.file, r.id])).toEqual([['CreatureModelData.dbc', 900], ['CreatureDisplayInfo.dbc', 901], ['Spell.dbc', 903]]);
    const model = layoutOf(MODEL_FILE)!.fields;
    expect(plan.dbc[0]!.values[fieldIndex(model, 'ModelPath')]).toBe('Creature\\CoA_SunCharger\\CoA_SunCharger.mdx');
    const display = layoutOf('CreatureDisplayInfo.dbc')!.fields;
    expect(plan.dbc[1]!.values[fieldIndex(display, 'ModelID')]).toBe(900);
    expect(plan.dbc[1]!.values[fieldIndex(display, 'TextureVariation1')]).toBe('CoA_SunCharger_Tex1');
    expect(plan.npc).toMatchObject({ entry: 902, displayId: 901, name: 'Sun Charger' });
    expect(plan.item!.item).toMatchObject({ entry: 904, itemClass: 15, subclass: 5, displayId: 55 });
    expect(plan.item!.item.spells.map((s) => [s.spell, s.trigger])).toEqual([[SPELL_LEARNING, 0], [903, 6]]);
    expect(plan.item!.dbcRow).toMatchObject({ ID: '904', ClassID: '15', SubclassID: '5', DisplayInfoID: '55' });
  });
  it('plans a companion item as subclass 2 and an NPC with no spell or item', () => {
    expect(buildPlan(draft('companion'), ids, {}, []).item!.item.subclass).toBe(2);
    const npc = buildPlan(draft('npc'), ids, {}, []);
    expect(npc.item).toBeUndefined();
    expect(npc.dbc).toHaveLength(2);
  });
  it('refuses a nameless draft and a flying mount without a speed', () => {
    expect(draftIssues(draft('mount', { name: '!!' }))).toHaveLength(1);
    expect(draftIssues(draft('mount', { flying: true, flightSpeed: 0 }))).toHaveLength(1);
    expect(draftIssues(draft('mount'))).toEqual([]);
  });
});

describe('applying a plan', () => {
  it('puts the records, creature, item, client row and files in the project, and claims the new record ids', () => {
    const plan = buildPlan(draft('mount'), ids, {}, []);
    const store = applyPlan({ ...emptyStore, items: [newItem(1)] }, plan, [{ paths: ['Creature\\a.m2'], data: 'AA==' }]);
    expect(store.npcs.map((n) => n.entry)).toEqual([902]);
    expect(store.items.map((i) => i.entry)).toEqual([1, 904]);
    expect(store.rowsets!.map((r) => r.table)).toEqual(['item_dbc']);
    expect(store.clientFiles).toHaveLength(1);
    expect(newDbcIds(store.dbcEdits)).toEqual(expect.arrayContaining([{ table: 'Spell.dbc', id: '903' }, { table: 'CreatureModelData.dbc', id: '900' }, { table: 'CreatureDisplayInfo.dbc', id: '901' }]));
  });
  it('replaces what an earlier run made under the same ids', () => {
    const plan = buildPlan(draft('mount'), ids, {}, []);
    const once = applyPlan(emptyStore, plan, []);
    const twice = applyPlan(once, plan, []);
    expect(twice.npcs).toHaveLength(1);
    expect(twice.items).toHaveLength(1);
  });
});
