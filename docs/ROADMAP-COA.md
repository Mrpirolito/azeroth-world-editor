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

### Gap audit (branch `feat/keira-coverage`)

Status: **covered** (AWE edits it in full), **partial** (some columns or cases), **missing**. The last column says where it is
done in this branch, or what stays open. Every row written goes through the project pipeline (undoable, exported as SQL with a
revert); the world database is only read.

How the new editors work. One table is one `TableSpec` (`src/core/tables/specs.ts`): its columns with labels, help, named
flags, enums and id pickers. One sheet (`src/renderer/tables/Sheet.tsx`) edits any spec; one writer (`rowsetStatements`) turns
the held `RowSet`s into DELETE-by-key plus INSERT with a revert; one validator (`rowsetIssues`) checks them. Sets live in
`ProjectEntities.rowsets`, beside the entities, and leave with their owner. Columns of a template row (`creature_template`,
`gameobject_template`) are laid over the row the entity already writes (`overlayColumns`). Loot, texts and every standalone table
use the same pieces.

| Keira3 editor | AWE today | Result |
|---|---|---|
| creature_template | partial: name, levels, faction, rank, type, flags for gossip/quests/vendor/trainer, health and damage multipliers | covered: Traits tab (combat, movement, kind, flags, rewards, immunities set, advanced) |
| creature_template_addon | missing | covered: Behaviour tab (stance, height, weapons, mount, emote, auras, path) |
| creature_template_model | partial: first model only | partial: first model (Look tab); further models (`Idx` > 0) remain |
| creature_template_movement | missing | covered: Behaviour tab |
| creature_template_resistance | missing | covered: Behaviour tab |
| creature_template_spell | missing | covered: Behaviour tab |
| creature_equip_template | partial: main hand, off hand, ranged of set 1 | partial: other equipment sets remain |
| creature_formations | missing | covered: Tables dialog (Spawns and groups) |
| creature_onkill_reputation | missing | covered: Rewards tab |
| creature_questitem | partial: through the quest drops panel | covered: Rewards tab |
| creature_text | partial: written by scenes, read by SmartAI | covered: Texts tab |
| creature spawn, spawn addon | spawns: covered in the World view; `creature_addon` of a spawn: partial (path only) | partial: spawn addon (mount, auras, stance of one spawn) remains |
| npc_vendor, trainer, default trainer | covered (Vendor, Trainer tabs) | covered |
| creature_loot_template | covered (Loot tab) | covered |
| pickpocketing_loot_template, skinning_loot_template | missing | covered: Rewards tab, shared loot sheet |
| SAI (creature) | covered (phase 2) | covered |
| quest_template | covered (quest panels) | covered |
| quest_template_addon (prev/next/exclusive/breadcrumb, skill, rep, special flags) | covered (Requirements, Chain panels) | covered |
| quest_template_locale | covered (locales) | covered |
| quest_offer_reward, quest_request_items | covered (Dialogue panel) | covered |
| creature/gameobject queststarter and questender | covered (Giver panel) | covered |
| quest chain view, breadcrumbs, exclusive groups | covered (quests dock graph, link components) | covered |
| gameobject_template | partial: type, look, size, name, page, loot id, quest | covered: Details tab (settings of chests and use-once objects, advanced) |
| gameobject_template_addon | missing | covered: Details tab |
| gameobject_loot_template | covered (chests) | covered |
| gameobject_questitem | partial: quest drops panel | covered: Details tab |
| gameobject spawn addon (`gameobject_addon`) | missing | missing: stays open |
| item_template (stats, sockets, spells, flags) | covered: typed stats, damage, spells; every other column raw under Advanced | partial: flags and sockets as raw numbers; named toggles remain |
| item_enchantment_template | missing | covered: Tables dialog |
| item, disenchant, prospecting, milling loot | missing | covered: item tabs "Opens into" and "Breaks down into" |
| reference, fishing, mail, spell loot | missing | covered: Tables dialog, same loot sheet |
| broadcast_text, npc_text, page_text, acore_string | partial: npc_text and page_text through gossip and readable objects | covered: Tables dialog |
| gossip_menu, gossip_menu_option | covered (Gossip tab) | covered |
| conditions | partial: quest conditions; gossip conditions read, never written | covered: shared condition builder (gossip, loot, quests, SmartAI) |
| game_tele | missing | covered: Tables dialog |
| trainer | covered | covered |
| creature_immunities | missing | covered: Tables dialog, and the Traits tab names the set |
| unused guid / id search | partial: ids are allocated for new things | covered: Tools in the Tables dialog |
| SQL console | missing | covered: read-only, enforced in the database layer (SELECT, SHOW, DESCRIBE, EXPLAIN; one statement; read-only transaction) |

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
