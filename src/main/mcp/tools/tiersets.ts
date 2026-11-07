import { z } from 'zod';
import { bonusSchema, templateSchema, type Bonus } from '../../../core/tiersets/bonus';
import { composeSet } from '../../../core/tiersets/compose';
import { PIECES, QUALITIES, TIER_CLASSES } from '../../../core/tiersets/model';
import { defineTool } from '../tool';

const piece = z.object({
  name: z.string().max(100).optional(),
  inventoryType: z.number().int().min(1).max(28).optional(),
  armor: z.number().int().min(0).optional(),
  stats: z.array(z.object({ type: z.number().int().min(0), value: z.number().int() })).max(10).optional(),
  look: z.union([
    z.object({ kind: z.literal('existing'), displayId: z.number().int().min(1) }),
    z.object({ kind: z.literal('new'), baseDisplayId: z.number().int().min(1), icon: z.string().max(200).optional() }),
  ]).optional(),
});

/** Tier sets: five armor pieces of one class saved into the project as items, client rows, an item set and client files */
export const tierSetTools = [
  defineTool({
    name: 'tier_set',
    title: 'Create, change or read a tier set',
    description:
      `Tier sets: head, shoulders, chest, hands and legs of one class. action "read" gives the named set (or all of them without a name). "create" and "update" save the set into the project as one undo step: five armor items (item_template), their item_dbc rows, an ItemSet.dbc record and, for a look made new, an ItemDisplayInfo record copied from baseDisplayId. Item, item set and display ids are allocated on the first save and kept. Stats and armor are suggested from the item level, quality, slot and class unless given (autoStats true suggests them again on update). A look is {kind:"existing", displayId} or {kind:"new", baseDisplayId}; the textures and models of a new look are dropped on the Tier Sets tab (they cannot be sent here). Classes: ${TIER_CLASSES.map((c) => `${c.id} ${c.name}`).join(', ')}. export_client_patch writes the DBC records and the files; the SQL is exported as usual. The items must also be registered in the server's C++ (ClientItemPatches), which the result warns about.`,
    input: {
      action: z.enum(['read', 'create', 'update']),
      name: z.string().min(1).max(60).optional(),
      classId: z.number().int().min(1).max(32).optional(),
      armorType: z.enum(['cloth', 'leather', 'mail', 'plate']).optional(),
      itemLevel: z.number().int().min(1).max(1000).optional(),
      requiredLevel: z.number().int().min(1).max(255).optional(),
      quality: z.enum(QUALITIES).optional(),
      raid: z.string().max(80).optional(),
      difficulty: z.string().max(40).optional(),
      autoStats: z.boolean().optional(),
      pieces: z.partialRecord(z.enum(PIECES), piece).optional(),
    },
    write: { kind: 'step', label: ({ action, name }: { action: string; name?: string }) => `AI: tier set ${action} ${name ?? ''}`.trim() },
    run: async ({ action, name, autoStats, pieces, ...rest }, ctx) => {
      const all = await ctx.call('tierSets');
      if (!all.ok) return all;
      const found = name ? all.value.find((t) => t.name.toLowerCase() === name.toLowerCase()) : undefined;
      if (action === 'read') {
        if (!name) return all;
        return found ? { ok: true as const, value: found } : { ok: false as const, error: { code: 'BAD_REQUEST' as const, message: `The project has no tier set "${name}".` } };
      }
      if (!name) return { ok: false as const, error: { code: 'BAD_REQUEST' as const, message: 'Give the set a name.' } };
      if (action === 'create' && found) return { ok: false as const, error: { code: 'BAD_REQUEST' as const, message: `The set "${name}" exists; use action "update".` } };
      if (action === 'update' && !found) return { ok: false as const, error: { code: 'BAD_REQUEST' as const, message: `The project has no tier set "${name}"; use action "create".` } };
      const patchPieces = pieces && Object.fromEntries(Object.entries(pieces).map(([key, p]) => {
        const { look, ...more } = p;
        const mapped = look?.kind === 'new' ? { kind: 'new' as const, baseDisplayId: look.baseDisplayId, displayId: 0, textures: {}, model: false, icon: look.icon ?? '' } : look;
        return [key, { ...more, ...(mapped ? { look: mapped } : {}) }];
      }));
      let set;
      try {
        set = composeSet(name, found, { ...rest, ...(patchPieces ? { pieces: patchPieces } : {}) }, autoStats ?? false);
      } catch (error) {
        return { ok: false as const, error: { code: 'BAD_REQUEST' as const, message: error instanceof Error ? error.message : String(error) } };
      }
      return ctx.call('tierSetSave', set);
    },
  }),
  defineTool({
    name: 'tier_set_bonus',
    title: 'Set bonuses of a tier set',
    description:
      'Bonuses of a saved tier set (2, 4... pieces). Each bonus is a template: {kind:"stat", stat, value} (strength, agility, stamina, intellect, spirit, attackPower, spellPower, crit, haste, hit, expertise, armorPen, mp5), {kind:"damagePct", spells:[ids], value}, {kind:"cooldown", spells, seconds}, {kind:"costPct", spells, value}, {kind:"critChance", spells, value}, {kind:"proc", event (meleeHit, rangedHit, spellDamage, spellHeal, periodic, damageTaken), chance, triggerSpell}, {kind:"healingPct", value}, {kind:"damageTakenPct", value}, or {kind:"pending", reason} for what the existing auras cannot express (needs server code; no spell is made). Spell ids come from search_spells. Saving makes a passive spell per bonus (Spell.dbc, plus a spell_proc row for procs), writes it into the ItemSet record and generates its tooltip; a bonus keeps its spell id on later saves and removing a bonus removes its spell. action "draft" turns free text ("Increases the damage of Fireball by 10%") into a template draft (rule-based, spell names looked up in Spell.dbc; read the notes) and saves nothing; "add" and "update" take a template, or `text` to use its draft; "list" reads; "remove" drops the bonus at `index` (from 0).',
    input: {
      action: z.enum(['list', 'draft', 'add', 'update', 'remove']),
      name: z.string().min(1).max(60).optional(),
      index: z.number().int().min(0).max(7).optional(),
      threshold: z.number().int().min(1).max(8).optional(),
      template: templateSchema.optional(),
      text: z.string().min(1).max(500).optional(),
    },
    write: { kind: 'step', label: ({ action, name }: { action: string; name?: string }) => `AI: tier set bonus ${action} ${name ?? ''}`.trim() },
    run: async ({ action, name, index, threshold, template, text }, ctx) => {
      const bad = (message: string) => ({ ok: false as const, error: { code: 'BAD_REQUEST' as const, message } });
      if (action === 'draft') return text ? ctx.call('tierSetBonusDraft', text) : bad('Give the text to read.');
      if (!name) return bad('Give the name of the tier set.');
      const all = await ctx.call('tierSets');
      if (!all.ok) return all;
      const set = all.value.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (!set) return bad(`The project has no tier set "${name}"; save it with tier_set first.`);
      if (action === 'list') return { ok: true as const, value: set.bonuses };
      const bonuses: Bonus[] = structuredClone(set.bonuses);
      const old = index === undefined ? undefined : bonuses[index];
      if (action !== 'add' && !old) return bad(`The set has no bonus at index ${index ?? '?'}.`);
      if (action === 'remove') bonuses.splice(index!, 1);
      else {
        let made = template;
        if (!made && text) {
          const draft = await ctx.call('tierSetBonusDraft', text);
          if (!draft.ok) return draft;
          if (draft.value.notes.length > 0) return bad(`The text needs a look first: ${draft.value.notes.join(' ')} Use action "draft", fix the template and send it as \`template\`.`);
          made = draft.value.template;
        }
        if (!made && !old) return bad('Give a template, or text to read into one.');
        const next = bonusSchema.parse({ threshold: threshold ?? old?.threshold ?? (bonuses.some((b) => b.threshold === 2) ? 4 : 2), template: made ?? old!.template, text: text ?? old?.text ?? '', spellId: old?.spellId ?? 0 });
        if (old) bonuses[index!] = next;
        else bonuses.push(next);
      }
      return ctx.call('tierSetSave', { ...set, bonuses });
    },
  }),
];
