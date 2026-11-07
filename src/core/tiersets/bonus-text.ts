import type { BonusStat, BonusTemplate, ProcEvent } from './bonus';

/**
 * A rule-based reading of the bonus wording designers use ("Increases the damage of Fireball by 10%") into a template.
 * Spell names are left as names: the caller finds their ids. What no rule matches becomes a pending bonus.
 */

export interface ParsedBonus {
  template: BonusTemplate;
  /** Names of the spells the template aims at, in the order of `spells` (a proc: its trigger spell is the last one) */
  spellNames: string[];
  /** What needs a human: names not found, a rule that only partly matched */
  notes: string[];
}

const STAT_WORDS: readonly (readonly [RegExp, BonusStat])[] = [
  [/armor penetration(?: rating)?/, 'armorPen'], [/expertise(?: rating)?/, 'expertise'],
  [/crit(?:ical strike)?(?: strike)?(?: rating)?/, 'crit'], [/haste(?: rating)?/, 'haste'], [/hit(?: rating)?/, 'hit'],
  [/attack power|\bap\b/, 'attackPower'], [/spell power|\bsp\b/, 'spellPower'], [/mana per 5 sec(?:onds)?|\bmp5\b/, 'mp5'],
  [/strength/, 'strength'], [/agility/, 'agility'], [/stamina/, 'stamina'], [/intellect/, 'intellect'], [/spirit/, 'spirit'],
];

const clean = (s: string): string => s.replace(/^(?:the|your)\s+/i, '').replace(/[.\s]+$/g, '').replace(/^["']|["']$/g, '').trim();
const names = (s: string): string[] => s.split(/\s*(?:,|\band\b|&)\s*/i).map(clean).filter((n) => n !== '');

function procEvent(text: string): ProcEvent {
  if (/\bmelee\b|\bon hit\b|\bwhite\b|auto.?attack/.test(text)) return 'meleeHit';
  if (/\branged\b/.test(text)) return 'rangedHit';
  if (/\bheal(?:ing)?\b/.test(text)) return 'spellHeal';
  if (/\bperiodic\b|\btick\b|\bdot\b/.test(text)) return 'periodic';
  if (/\btaken\b|\bagainst you\b|\bwhen (?:you are )?(?:hit|attacked|struck)\b/.test(text)) return 'damageTaken';
  return 'spellDamage';
}

const pending = (text: string): ParsedBonus => ({
  template: { kind: 'pending', reason: `Needs manual review / needs server code: "${text.trim()}" matches no template.` },
  spellNames: [],
  notes: ['Needs manual review: the text matches no template, so no spell is made. Pick a template by hand or write server code.'],
});

export function parseBonusText(raw: string): ParsedBonus {
  const text = raw.trim().replace(/\s+/g, ' ').replace(/^\(?\d+\)?\s*(?:set|pieces?|pc)?\s*(?:bonus)?\s*:\s*/i, '');
  const low = text.toLowerCase();
  const done = (template: BonusTemplate, spellNames: string[]): ParsedBonus => ({ template, spellNames, notes: [] });
  let m: RegExpMatchArray | null;

  // Proc: "Your melee attacks have a 10% chance to cast X", "10% chance on hit to X", "chance on hit to X"
  if ((m = text.match(/(\d+)\s*%\s*chance\s+(?:on\s+[a-z ]+?\s+)?to\s+(?:cast|trigger|gain|proc|apply|summon)?\s*(.+)$/i)) || (m = text.match(/chance\s+on\s+([a-z ]+?)\s+to\s+(?:cast|trigger|gain|proc|apply)?\s*(.+)$/i))) {
    const chance = /^\d+$/.test(m[1]!) ? Number(m[1]) : 100;
    const target = clean(m[2]!);
    return done({ kind: 'proc', event: procEvent(low), chance: Math.max(1, Math.min(100, chance)), triggerSpell: 0 }, [target]);
  }
  // Cooldown: "Reduces the cooldown of X by 2 sec", "X cooldown reduced by 3 seconds"
  if ((m = text.match(/(?:reduces?|decreases?)\s+(?:the\s+)?cooldown\s+(?:of|on)\s+(.+?)\s+by\s+(\d+(?:\.\d+)?)\s*(?:sec|seconds|s)\b/i))) {
    return done({ kind: 'cooldown', spells: [], seconds: Math.round(Number(m[2])) }, names(m[1]!));
  }
  if ((m = text.match(/^(.+?)\s+cooldown\s+(?:is\s+)?(?:reduced|decreased)\s+by\s+(\d+(?:\.\d+)?)\s*(?:sec|seconds|s)\b/i))) {
    return done({ kind: 'cooldown', spells: [], seconds: Math.round(Number(m[2])) }, names(m[1]!));
  }
  // Cost: "Reduces the mana cost of X by 10%"
  if ((m = text.match(/(?:reduces?|decreases?)\s+(?:the\s+)?(?:[a-z]+\s+)?cost\s+of\s+(.+?)\s+by\s+(\d+)\s*%/i)) || (m = text.match(/^(.+?)\s+(?:[a-z]+\s+)?cost\s+(?:is\s+)?(?:reduced|decreased)\s+by\s+(\d+)\s*%/i))) {
    return done({ kind: 'costPct', spells: [], value: Number(m[2]) }, names(m[1]!));
  }
  // Crit chance of a spell: "Increases the critical strike chance of X by 5%", "+5% crit chance for X"
  if ((m = text.match(/(?:increases?|improves?)\s+(?:the\s+)?crit(?:ical strike)?\s+chance\s+(?:of|for|on)\s+(.+?)\s+by\s+(\d+)\s*%/i))) {
    return done({ kind: 'critChance', spells: [], value: Number(m[2]) }, names(m[1]!));
  }
  if ((m = text.match(/\+\s*(\d+)\s*%\s*crit(?:ical strike)?\s+chance\s+(?:for|on|to|with)\s+(.+)$/i))) {
    return done({ kind: 'critChance', spells: [], value: Number(m[1]) }, names(m[2]!));
  }
  // Healing and damage taken
  if ((m = text.match(/(?:increases?|improves?)\s+(?:your\s+)?healing(?: done)?\s+by\s+(\d+)\s*%/i))) return done({ kind: 'healingPct', value: Number(m[1]) }, []);
  if ((m = text.match(/(?:reduces?|decreases?)\s+(?:all\s+)?damage\s+taken\s+by\s+(\d+)\s*%/i))) return done({ kind: 'damageTakenPct', value: Number(m[1]) }, []);
  // Damage of a spell: "Increases the damage of X by 10%", "Increases damage dealt by X by 10%", "X deals 10% more damage", "X damage increased by 10%"
  if ((m = text.match(/(?:increases?|improves?)\s+(?:the\s+)?damage\s+(?:done\s+)?(?:of|dealt by|done by)\s+(.+?)\s+by\s+(\d+)\s*%/i))) {
    return done({ kind: 'damagePct', spells: [], value: Number(m[2]) }, names(m[1]!));
  }
  if ((m = text.match(/^(.+?)\s+(?:deals?|does)\s+(\d+)\s*%\s+more\s+damage/i)) || (m = text.match(/^(.+?)\s+damage\s+(?:is\s+)?(?:increased|improved)\s+by\s+(\d+)\s*%/i))) {
    return done({ kind: 'damagePct', spells: [], value: Number(m[2]) }, names(m[1]!));
  }
  if ((m = text.match(/\+\s*(\d+)\s*%\s+damage\s+(?:to|for|on|with)\s+(.+)$/i))) return done({ kind: 'damagePct', spells: [], value: Number(m[1]) }, names(m[2]!));
  // Stats: "+20 Strength", "Increases your crit rating by 30", "Increases attack power by 40"
  for (const [word, stat] of STAT_WORDS) {
    const w = word.source;
    const a = text.match(new RegExp(`\\+\\s*(\\d+)\\s+(?:${w})\\b`, 'i'));
    const b = text.match(new RegExp(`(?:increases?|improves?|grants?)\\s+(?:your\\s+)?(?:${w})\\s+by\\s+(\\d+)\\b`, 'i'));
    const c = text.match(new RegExp(`(?:increases?|improves?|grants?)\\s+(?:your\\s+)?(\\d+)\\s+(?:${w})\\b`, 'i'));
    const hit = a ?? b ?? c;
    if (hit) return done({ kind: 'stat', stat, value: Number(hit[1]) }, []);
  }
  return pending(raw);
}

/** The draft with its spell names turned into ids by `find`; a name `find` cannot answer is listed in the notes and left out */
export function resolveBonus(parsed: ParsedBonus, find: (name: string) => number | undefined): ParsedBonus {
  const t = parsed.template;
  const notes = [...parsed.notes];
  const ids = parsed.spellNames.map((n) => {
    const id = find(n);
    if (id === undefined) notes.push(`Needs manual review: the spell "${n}" was not found; pick it by hand.`);
    return id;
  }).filter((id): id is number => id !== undefined);
  if (t.kind === 'proc') return { ...parsed, template: { ...t, triggerSpell: ids[0] ?? 0 }, notes };
  if ('spells' in t) return { ...parsed, template: { ...t, spells: ids }, notes };
  return { ...parsed, notes };
}
