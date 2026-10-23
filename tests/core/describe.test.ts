import { describe, expect, it } from 'vitest';
import { describeItem, describeNpc, describeObject } from '../../src/core/entities/describe';
import { emptyFight, newAbility } from '../../src/core/combat/model';
import { newItem, newNpc, newObject } from '../../src/core/entities/model';
import { ITEM_FIELDS } from '../../src/core/tables/item-fields';
import { loadFork } from '../helpers/ddl';

describe('the summary cards', () => {
  it('says what an NPC is and does in one line', () => {
    expect(describeNpc({ ...newNpc(1), minLevel: 10, maxLevel: 12, rank: 'elite', type: 'humanoid' })).toBe('Level 10-12 elite humanoid. 0 spawns.');
    const guard = {
      ...newNpc(2), minLevel: 55, maxLevel: 55, questGiver: true, gossip: true, type: 'beast' as const,
      vendor: [{ item: 1, maxCount: 0, restockSecs: 0, extendedCost: 0 }], loot: [{ item: 5, chance: 10, min: 1, max: 1, questOnly: false }, { item: 6, chance: 10, min: 1, max: 1, questOnly: false }],
      spawns: [{ guid: 1, map: 0, x: 0, y: 0, z: 0, o: 0, respawnSecs: 300, wander: 0, patrol: null, rotation: null, events: 'npc' as const }],
    };
    expect(describeNpc(guard)).toBe('Level 55 beast, gives quests, talks, sells 1 item, drops 2 items. 1 spawn.');
    const fight = emptyFight();
    expect(describeNpc({ ...guard, fight: { ...fight, abilities: [newAbility(fight)] } })).toContain('fights with 1 ability');
    expect(describeNpc({ ...newNpc(3), smartScripts: [{ id: '0' }, { id: '1' }] })).toContain('runs 2 SmartAI rows');
  });

  it('counts an existing NPC\'s spawns from the database', () => {
    const existing = { ...newNpc(4), origin: { kind: 'existing' as const, original: {}, sharedLoot: 0, spawnCount: 7, locked: [] } };
    expect(describeNpc(existing)).toMatch(/7 spawns\.$/);
  });

  it('says what an object holds', () => {
    expect(describeObject({ ...newObject(1), type: 'chest' })).toBe('Chest, holds nothing yet. 0 spawns.');
    expect(describeObject({ ...newObject(1), type: 'chest', loot: [{ item: 1, chance: 1, min: 1, max: 1, questOnly: false }] })).toContain('holds 1 item');
    expect(describeObject({ ...newObject(1), type: 'goober', onlyDuringQuest: 77, pages: [{ id: 1, text: 'x' }] })).toBe('Use-once object, shows 1 page, only while quest 77 is in the log. 0 spawns.');
  });

  it('says what an item is', () => {
    expect(describeItem({ ...newItem(1), quality: 'epic', itemClass: 2, subclass: 7, itemLevel: 80, requiredLevel: 70, stats: [{ type: 7, value: 20 }], spells: [{ spell: 1, trigger: 1, charges: 0, cooldownMs: -1, category: 0, categoryCooldownMs: -1 }] }))
      .toBe('Epic sword (one-hand) (weapon), item level 80, needs level 70, 1 stat, 1 spell.');
    expect(describeItem({ ...newItem(2), startsQuest: 9, pages: [{ id: 1, text: 'x' }] })).toBe('Common quest, starts quest 9, readable.');
  });
});

describe('the item property fields', () => {
  it('are columns of item_template, none of them typed fields of the editor', async () => {
    const names = loadFork(['item_template']).item_template!.map((c) => c.name);
    const { MODELLED_ITEM_COLUMNS } = await import('../../src/core/entities/item-columns');
    for (const f of ITEM_FIELDS) {
      expect(names, f.column).toContain(f.column);
      expect(MODELLED_ITEM_COLUMNS.has(f.column), `${f.column} is typed already`).toBe(false);
    }
    expect(new Set(ITEM_FIELDS.map((f) => f.column)).size).toBe(ITEM_FIELDS.length);
  });
});
