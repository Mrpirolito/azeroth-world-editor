import { describe, expect, it } from 'vitest';
import { ACTIONS, EVENTS, SOURCE_MASK, TARGETS, TYPES, pickable, sourceBit, typeName, typeOf } from '../../src/core/smartai/catalogue';
import { formatParam, say } from '../../src/core/smartai/format';
import { ACTION, EVENT, TARGET, actionName, describeEvent, stepName } from '../../src/core/smartai/ids';
import { blankRow, withColumns } from '../../src/core/smartai/row';
import { describeRow, sentenceOf } from '../../src/core/smartai/describe';

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const ids = (list: readonly { id: number }[]): number[] => list.map((t) => t.id);

describe('the SmartAI catalogue', () => {
  it('has every event the server supports on 3.3.5a, and none it does not', () => {
    // SMART_EVENT_* in SmartScriptMgr.h: 0-77, 82 and the AzerothCore range 101-110 (78-81 are scene events, unused on 3.3.5a)
    expect(ids(EVENTS)).toEqual([...range(0, 77), 82, ...range(101, 110)]);
  });

  it('has every action the server supports on 3.3.5a', () => {
    // 16, 119 and 120 are reserved or not implemented on the server
    const expected = [...range(0, 15), ...range(17, 118), ...range(121, 126), 131, 132, ...range(134, 136), 142, 201, ...range(203, 242)];
    expect(ids(ACTIONS)).toEqual(expected);
  });

  it('has every target the server supports', () => {
    expect(ids(TARGETS)).toEqual([...range(0, 29), ...range(201, 207)]);
  });

  it('names and explains every type, with no two types sharing an id or a constant', () => {
    for (const kind of ['event', 'action', 'target'] as const) {
      const list = TYPES[kind];
      expect(new Set(list.map((t) => t.id)).size).toBe(list.length);
      expect(new Set(list.map((t) => t.key)).size).toBe(list.length);
      for (const t of list) {
        expect(t.name.length, `${kind} ${t.id} name`).toBeGreaterThan(2);
        expect(t.help.length, `${kind} ${t.id} help`).toBeGreaterThan(5);
        expect(t.say.length, `${kind} ${t.id} say`).toBeGreaterThan(2);
        expect(t.params.length, `${kind} ${t.id} params`).toBeLessThanOrEqual(kind === 'target' ? 4 : 6);
      }
    }
  });

  it('gives every parameter a meaning: a unique label, bits for flags, choices for enums, a max after a min', () => {
    for (const kind of ['event', 'action', 'target'] as const) {
      for (const t of TYPES[kind]) {
        const labels = t.params.map((p) => p.label);
        expect(new Set(labels).size, `${kind} ${t.id} ${t.key} labels ${labels.join('|')}`).toBe(labels.length);
        t.params.forEach((p, i) => {
          if (p.kind === 'flags') expect(p.bits?.length, `${t.key} ${p.label}`).toBeGreaterThan(0);
          if (p.kind === 'enum') expect(p.options?.length, `${t.key} ${p.label}`).toBeGreaterThan(0);
          if (p.pair === 'min') expect(t.params[i + 1]?.pair, `${t.key} ${p.label} needs a max next to it`).toBe('max');
        });
        // A sentence only names parameters the type has
        for (const m of t.say.matchAll(/\{(\d)\}/g)) expect(Number(m[1]), `${t.key} say`).toBeLessThanOrEqual(t.params.length);
      }
    }
  });

  it('knows the script kinds each event works in, as the server does', () => {
    expect(typeOf('event', EVENT.link)?.sources).toBe(SOURCE_MASK.any - SOURCE_MASK.timedList);
    expect(typeOf('event', 70)?.sources).toBe(SOURCE_MASK.gameobject);
    expect(typeOf('event', 62)!.sources! & sourceBit(1)).not.toBe(0);
    expect(typeOf('event', 2)!.sources! & sourceBit(1)).toBe(0);
    expect(typeOf('event', 0)!.sources! & sourceBit(9)).not.toBe(0);
    expect(typeOf('event', 4)!.sources! & sourceBit(9)).toBe(0);
  });

  it('covers every id the quest scripting vocabulary uses', () => {
    for (const id of Object.values(EVENT)) expect(typeOf('event', id), `event ${id}`).toBeDefined();
    for (const id of Object.values(ACTION)) expect(typeOf('action', id), `action ${id}`).toBeDefined();
    for (const id of Object.values(TARGET)) expect(typeOf('target', id), `target ${id}`).toBeDefined();
  });

  it('keeps types it does not offer for new rows, but still names them', () => {
    expect(pickable('action').some((t) => t.id === 76)).toBe(false);
    expect(pickable('action', 76).some((t) => t.id === 76)).toBe(true);
    expect(typeName('action', 76)).toMatch(/dangerous/);
    expect(typeName('event', 999)).toBe('Unknown event 999');
  });

  it('puts the unit of a parameter in how it reads', () => {
    const timer = typeOf('event', 0)!;
    expect(timer.params.map((p) => p.kind)).toEqual(['ms', 'ms', 'ms', 'ms']);
    expect(formatParam(timer.params[0], 2500)).toBe('2.5s');
    expect(formatParam(timer.params[0], 250)).toBe('250 ms');
    expect(formatParam(timer.params[0], 3000)).toBe('3s');
    const cast = typeOf('action', 11)!;
    expect(cast.params[0]!.kind).toBe('spell');
    expect(formatParam(cast.params[1], 3)).toBe('interrupt what it is casting + triggered (no cost, no cast time)');
    expect(formatParam(typeOf('event', 2)!.params[0], 40)).toBe('40');
    expect(formatParam(typeOf('event', 66)!.params[0], 5)).toBe('phase 1 or 3');
    expect(formatParam(typeOf('action', 8)!.params[0], 2)).toBe('aggressive');
  });

  it('names a creature it can look up, and says "any" for 0', () => {
    const kill = typeOf('event', 5)!;
    expect(formatParam(kill.params[3], 0)).toBe('any creature');
    expect(formatParam(kill.params[3], 299, (kind, id) => (kind === 'creature' && id === 299 ? 'Young Wolf' : undefined))).toBe('Young Wolf (299)');
    expect(formatParam(kill.params[3], 299)).toBe('creature 299');
  });
});

describe('describing a row', () => {
  const row = (over: Record<string, number | string>) => withColumns(blankRow(1000, 0, 0), over);

  it('reads event, action and target as a sentence, with the names it was given', () => {
    const r = row({ event_type: 8, event_param1: 116, action_type: 11, action_param1: 133, target_type: 2 });
    const names = (kind: string, id: number) => (kind === 'spell' ? { 116: 'Frostbolt', 133: 'Fireball' }[id as 116 | 133] : undefined);
    expect(describeRow(r, names)).toEqual({ when: 'when Frostbolt (116) hits it', only: [], does: 'cast Fireball (133)', on: 'its current target' });
    expect(sentenceOf(r, names)).toBe('When Frostbolt (116) hits it: cast Fireball (133), on its current target');
  });

  it('adds phase, chance and once-only to the sentence', () => {
    const r = row({ event_type: 4, event_phase_mask: 3, event_chance: 40, event_flags: 1, action_type: 1, action_param1: 2 });
    expect(describeRow(r).only).toEqual(['in phase 1 or 2', '40% of the time', 'only once']);
    expect(sentenceOf(r)).toBe('When it enters combat (in phase 1 or 2, 40% of the time, only once): say text group 2, on itself');
  });

  it('calls a linked step "Then", and leaves out the target of an action that needs none', () => {
    expect(sentenceOf(row({ event_type: 61, action_type: 24 }))).toBe('Then: evade and reset');
  });

  it('reuses the scripts module wording where it has some, and the catalogue elsewhere', () => {
    expect(describeEvent({ entryorguid: 1, sourceType: 0, id: 0, link: 0, eventType: 6, eventParams: [], actionType: 0, actionParams: [], targetType: 0, comment: '' })).toBe('when it dies');
    expect(describeEvent({ entryorguid: 1, sourceType: 0, id: 0, link: 0, eventType: 17, eventParams: [299, 0, 0, 0, 0, 0], actionType: 0, actionParams: [], targetType: 0, comment: '' })).toBe('when it summons creature 299');
    expect(describeEvent({ entryorguid: 1, sourceType: 0, id: 0, link: 0, eventType: 999, eventParams: [], actionType: 0, actionParams: [], targetType: 0, comment: '' })).toBe('on SmartAI event 999');
    expect(stepName(95)).toBe('add dynamic flags');
    expect(actionName(11)).toBe('SmartAI action 11');
    expect(say('action', 999, [])).toBe('action 999');
  });
});
