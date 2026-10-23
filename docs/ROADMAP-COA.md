# Roadmap CoA: AWE as a CoA game studio

Goal: one visual tool for all CoA content. Everything Keira3 edits, plus 3D previews, a full
SmartAI editor, richer quests, and DBC/MPQ editing (spells first). No walls of 20 text boxes:
every editor shows the few fields that matter, grouped and explained, with "Advanced" folded away.

## Ground rules

- Reuse AWE's pipeline: every edit is a project change (undoable), exported as one SQL patch.
  The world DB stays read-only, as today.
- Keira3 is AGPL-3.0, AWE is GPL-3.0-or-later. Use Keira3 as a reference for tables, fields,
  flags and enums (data knowledge), and write our own UI. If we copy Keira3 code verbatim, the
  combined app falls under AGPL-3.0 terms; decide that before copying anything.
- Each phase lands as its own branch and PR on Mrpirolito/azeroth-world-editor, with tests.

## UX pattern for every Keira3-style editor

1. Search/pick an entity (name, id, zone), with a 3D preview where there is a model.
2. A summary card in plain language ("Level 10-12 hostile humanoid, drops 3 items").
3. Tabs per topic (Looks, Combat, Loot, Vendor, Scripts...), 5-8 fields each.
4. Flags as named toggles, enums as dropdowns with descriptions, ids as pickers with name + icon.
5. "Advanced" section with the raw columns for the rest.
6. Live validation (missing refs, bad ranges) and a diff of the SQL it will write.

## Phase 1 - 3D model viewer (quick win)

AWE already loads M2 models for the World (`src/renderer/world3d/scene/model/loader`,
`spawn/DisplayResolver.ts`). Reuse it in a small standalone viewport:
- NPC: creature_template_model display ids, rotate/zoom, animation picker, equipment
  (creature_equip_template) on the model.
- GameObject: displayId preview.
- Item: icon and, where there is one, the model.
Done when: picking any NPC/object in an editor shows its model in under a second, no World needed.

## Phase 2 - SmartAI full editor

AWE compiles/decompiles quest "scenes" to SAI (`src/core/scripts`), but there is no editor for
arbitrary smart_scripts. Add:
- Visual event -> action -> target rows (node graph or ordered cards), per creature/GO/actionlist.
- Every event/action/target type with named params and help text (Keira3 `smart-scripts` and
  the AzerothCore wiki as source), linked rows (`link`), phases, flags, chance, repeat timers.
- Import existing rows from the DB, round-trip without loss, validate params.
- Search: "who uses action X / spell Y / text Z".
Done when: any existing SAI script round-trips byte-identical and new ones pass validation.

Status (branch `feat/smartai-editor`): implemented. `src/core/smartai/` holds the catalogue of every
event, action and target the CoA server supports (`SmartScriptMgr.h`), the row model, sentences,
validation, the DB read and the "who uses this" search. NPCs and objects carry `smartScripts` (all
their rows, written over the database's and reverted from the rows read at import); the NPC and object
Scripts tab opens them as cards. MCP tools: `smart_scripts`, `search_smart_scripts`. Rows written by
quest scenes, fights and patrols of the same NPC are not merged: an NPC whose rows are edited directly
owns all of them.

## Phase 3 - Keira3 coverage

Port editor by editor (ordered by CoA value):
1. Creature: template, addon, model, movement, resistance, spells, equip, formations, onkill
   reputation, questitem, texts, vendor, trainer, loot (creature/pickpocket/skinning).
2. Quest: everything AWE lacks today: locale, preview, quest-template-addon full fields
   (prev/next/exclusive groups, required skill/rep, special flags), gameobject starter/ender,
   chain view with breadcrumbs and exclusive groups.
3. GameObject: template, addon, loot, questitem, spawn addon.
4. Item: item_template (stats, sockets, spells, flags), enchantment, all item loots
   (item/disenchant/prospecting/milling).
5. Loot: reference, fishing, mail, spell loot; one shared loot-table component.
6. Texts: broadcast_text, npc_text, page_text, acore_string. Gossip menus. Conditions (shared
   condition builder usable from gossip, loot, SAI, quests). Game tele.
7. Tools: unused-guid search (reuse `src/core/ids`), SQL console (read-only to world DB).

## Phase 4 - DBC/MPQ editor and spell editor

- DBC writer next to the existing reader (`src/core/game/dbc.ts`): load, edit, save WDBC with
  string block rebuild; check CoA record sizes against 3.3.5 before writing.
- Spell editor: clone or edit spells in Spell.dbc (effects, auras, ranges, cast times, durations,
  icons, texts) with pickers for SpellIcon/SpellRange/SpellCastTimes/SpellDuration; plus DB
  tables spell_dbc, spell_custom_attr, spell_proc, spell_bonus_data, spell_group,
  spell_linked_spell, spell_target_position, spell_area, spell_script_names.
- Output: server Data/dbc files (with backup) + a client patch MPQ (new MPQ writer) named so it
  loads last, plus the SQL patch.
- Later: other DBCs (SpellIcon, Item display, Faction, Map/Area) with the same generic editor.

## Open decisions

- AGPL code copying vs. clean reimplementation (above).
- Client patch name and load order for CoA clients.
- Who owns which phase among the three of us.
