import { z } from 'zod';
import { PIECES, QUALITIES } from '../../../core/tiersets/model';
import { DIFFICULTIES, findGroup, tokenGroupSchema, type Obtain } from '../../../core/tiersets/obtain';
import { defineTool } from '../tool';

const drop = z.object({
  boss: z.number().int().min(1),
  tokens: z.array(z.enum(PIECES)).min(1).optional(),
  difficulties: z.array(z.enum(DIFFICULTIES)).min(1).optional(),
  chance: z.number().min(0).max(100),
  groupId: z.number().int().min(0).max(255).optional(),
  min: z.number().int().min(1).max(255).optional(),
  max: z.number().int().min(1).max(255).optional(),
});

const bad = (message: string) => ({ ok: false as const, error: { code: 'BAD_REQUEST' as const, message } });

/** Tokens of tier sets: the items bosses drop and a vendor exchanges for the set's pieces */
export const tierTokenTools = [
  defineTool({
    name: 'tier_tokens',
    title: 'Tier set tokens, boss drops and vendor',
    description:
      `How a tier set is obtained. A token group (like Blizzard's Conqueror/Protector/Vanquisher) is five token items, "<Helm|Mantle|Chestguard|Gloves|Leggings> of the <prefix> <group>" (misc item, bind on pickup, stacking), shared by the sets of the classes it serves. action "save" creates or updates a group (give prefix, group, classIds, quality, itemLevel, requiredLevel, displayId (0 copies the look of Chestguard of the Lost Conqueror) and drops; a given drops list replaces the old one): the items, their item_dbc rows and one ItemExtendedCost per token (client DBC and server table; an identical existing one is reused) are saved, and each drop {boss (creature entry), tokens (slots, default all), difficulties (${DIFFICULTIES.join(', ')}: the boss's own entry, then difficulty_entry_1..3, else the same entry), chance, groupId (rows of one group give one item per kill; 0 rolls each on its own), min, max} becomes creature_loot_template rows over the boss's loot table. The result lists what drops where, per boss. "read" gives a group (name = "prefix group") or all of them; "delete" removes one that no set uses. action "vendor" sets how a saved tier set is sold ("set" is its name): tokenGroup, and vendor {entry (an existing NPC; leave out to make a new one), name, subname, displayId (model), spawn {map,x,y,z,o} or null, classFilter (each class sees only its own set's pieces; default true)} or remove:true. The vendor sells each piece for one token of its slot; a new NPC is a project NPC exported with the SQL. Token ids are in the ClientItemPatches warning.`,
    input: {
      action: z.enum(['read', 'save', 'delete', 'vendor']),
      name: z.string().min(1).max(100).optional(),
      prefix: z.string().max(40).optional(),
      group: z.string().min(1).max(40).optional(),
      classIds: z.array(z.number().int().min(1).max(32)).min(1).optional(),
      quality: z.enum(QUALITIES).optional(),
      itemLevel: z.number().int().min(1).max(1000).optional(),
      requiredLevel: z.number().int().min(1).max(255).optional(),
      displayId: z.number().int().min(0).optional(),
      drops: z.array(drop).optional(),
      set: z.string().min(1).max(60).optional(),
      tokenGroup: z.string().max(100).optional(),
      vendor: z.object({
        entry: z.number().int().min(1).optional(),
        name: z.string().max(100).optional(),
        subname: z.string().max(100).optional(),
        displayId: z.number().int().min(0).optional(),
        spawn: z.object({ map: z.number().int().min(0), x: z.number(), y: z.number(), z: z.number(), o: z.number().optional() }).nullable().optional(),
        classFilter: z.boolean().optional(),
      }).optional(),
      remove: z.boolean().optional(),
    },
    write: { kind: 'step', label: ({ action, name, set }: { action: string; name?: string; set?: string }) => `AI: tier tokens ${action} ${name ?? set ?? ''}`.trim() },
    run: async ({ action, name, set: setName, tokenGroup, vendor, remove, drops, ...rest }, ctx) => {
      const groups = await ctx.call('tierTokenGroups');
      if (!groups.ok) return groups;
      if (action === 'vendor') {
        if (!setName) return bad('Give the name of the tier set.');
        const sets = await ctx.call('tierSets');
        if (!sets.ok) return sets;
        const set = sets.value.find((t) => t.name.toLowerCase() === setName.toLowerCase());
        if (!set) return bad(`The project has no tier set "${setName}"; save it with tier_set first.`);
        const old = set.obtain?.vendor ?? null;
        const group = tokenGroup ?? set.obtain?.tokenGroup ?? '';
        let next: Obtain['vendor'] = null;
        if (!remove) {
          const v = vendor ?? {};
          const existing = v.entry !== undefined;
          const base = old ?? { entry: 0, created: !existing, name: '', subname: '', displayId: 0, spawn: null, classFilter: true };
          next = {
            ...base, entry: existing ? v.entry! : base.created ? base.entry : 0, created: !existing, name: v.name ?? base.name, subname: v.subname ?? base.subname, displayId: v.displayId ?? base.displayId,
            classFilter: v.classFilter ?? base.classFilter,
            spawn: v.spawn === undefined ? base.spawn : v.spawn === null ? null : { guid: base.spawn?.guid ?? 0, map: v.spawn.map, x: v.spawn.x, y: v.spawn.y, z: v.spawn.z, o: v.spawn.o ?? 0 },
          };
        }
        return ctx.call('tierSetSave', { ...set, obtain: { tokenGroup: group, vendor: next } });
      }
      const found = name ? findGroup(groups.value, name) : undefined;
      if (action === 'read') {
        if (!name) return groups;
        return found ? { ok: true as const, value: found } : bad(`The project has no token group "${name}".`);
      }
      if (action === 'delete') {
        if (!name) return bad('Give the name of the group.');
        return ctx.call('tierTokenGroupDelete', name);
      }
      if (name && !found && !(rest.group || rest.prefix)) return bad(`The project has no token group "${name}"; give prefix, group and classIds to create it.`);
      const none = { head: 0, shoulders: 0, chest: 0, hands: 0, legs: 0 };
      const base = found ?? { prefix: '', group: '', classIds: [] as number[], quality: 'epic' as const, itemLevel: 213, requiredLevel: 80, displayId: 0, entries: none, costs: none, drops: [] };
      const made = tokenGroupSchema.safeParse({
        ...base, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
        ...(drops ? { drops: drops.map((d) => ({ ...d, bossName: found?.drops.find((o) => o.boss === d.boss)?.bossName ?? '' })) } : {}),
      });
      if (!made.success) return bad(`The group is not valid: ${made.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
      return ctx.call('tierTokenGroupSave', made.data);
    },
  }),
];
