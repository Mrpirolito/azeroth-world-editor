import { fightIsEmpty } from '../combat/model';
import { classLabel, ITEM_SUBCLASSES } from './item-vocab';
import type { CustomItem, CustomNpc, CustomObject } from './model';

/** One line in plain language about what an NPC, object or item is and does, for the card above its editor */

const count = (n: number, one: string, many: string = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const RANK_WORD = { normal: '', elite: 'elite ', rareElite: 'rare elite ', boss: 'boss ', rare: 'rare ' } as const;
const TYPE_WORD = { beast: 'beast', dragonkin: 'dragonkin', demon: 'demon', elemental: 'elemental', giant: 'giant', undead: 'undead', humanoid: 'humanoid', critter: 'critter', mechanical: 'mechanical', none: 'creature' } as const;

export function describeNpc(npc: CustomNpc): string {
  const level = npc.minLevel === npc.maxLevel ? `${npc.minLevel}` : `${npc.minLevel}-${npc.maxLevel}`;
  const does: string[] = [];
  if (npc.questGiver) does.push('gives quests');
  if (npc.gossip || npc.gossipMenu) does.push('talks');
  if (npc.vendor.length > 0) does.push(`sells ${count(npc.vendor.length, 'item')}`);
  if (npc.trainer) does.push(`teaches ${count(npc.trainer.spells.length, 'spell')}`);
  if (npc.loot.length > 0) does.push(`drops ${count(npc.loot.length, 'item')}`);
  if (npc.fight && !fightIsEmpty(npc.fight)) does.push(`fights with ${count(npc.fight.abilities.length, 'ability', 'abilities')}`);
  if (npc.smartScripts && npc.smartScripts.length > 0) does.push(`runs ${count(npc.smartScripts.length, 'SmartAI row')}`);
  const placed = npc.origin.kind === 'existing' ? npc.origin.spawnCount : npc.spawns.length;
  return `Level ${level} ${RANK_WORD[npc.rank]}${TYPE_WORD[npc.type]}${does.length > 0 ? `, ${does.join(', ')}` : ''}. ${count(placed, 'spawn')}.`;
}

const OBJECT_WORD: Record<CustomObject['type'], string> = { questGiver: 'Quest giver object', chest: 'Chest', generic: 'Decoration', text: 'Readable object', goober: 'Use-once object' };

export function describeObject(object: CustomObject): string {
  const does: string[] = [];
  if (object.type === 'chest') does.push(object.loot.length > 0 ? `holds ${count(object.loot.length, 'item')}` : 'holds nothing yet');
  if (object.pages.length > 0) does.push(`shows ${count(object.pages.length, 'page')}`);
  if (object.onlyDuringQuest) does.push(`only while quest ${object.onlyDuringQuest} is in the log`);
  if (object.smartScripts && object.smartScripts.length > 0) does.push(`runs ${count(object.smartScripts.length, 'SmartAI row')}`);
  const placed = object.origin.kind === 'existing' ? object.origin.spawnCount : object.spawns.length;
  return `${OBJECT_WORD[object.type]}${does.length > 0 ? `, ${does.join(', ')}` : ''}. ${count(placed, 'spawn')}.`;
}

export function describeItem(item: CustomItem): string {
  const sub = ITEM_SUBCLASSES[item.itemClass]?.find(([v]) => v === item.subclass)?.[1];
  const kind = sub && sub !== classLabel(item.itemClass) ? `${sub.toLowerCase()} (${classLabel(item.itemClass).toLowerCase()})` : classLabel(item.itemClass).toLowerCase();
  const does: string[] = [];
  if (item.itemLevel > 1) does.push(`item level ${item.itemLevel}`);
  if (item.requiredLevel > 0) does.push(`needs level ${item.requiredLevel}`);
  if (item.stats.length > 0) does.push(count(item.stats.length, 'stat'));
  if (item.spells.length > 0) does.push(count(item.spells.length, 'spell'));
  if (item.startsQuest > 0) does.push(`starts quest ${item.startsQuest}`);
  if (item.pages.length > 0) does.push('readable');
  return `${item.quality[0]!.toUpperCase()}${item.quality.slice(1)} ${kind}${does.length > 0 ? `, ${does.join(', ')}` : ''}.`;
}

