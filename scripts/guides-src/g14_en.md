TITLE: World bosses with AWE: from Setis to any boss
This guide is the generalised version of the original guide 14 (Setis). It explains the pattern shared by the CoA world bosses (Setis, Azuregos, Kazzak, The Will of Soggoth...), what you do with AWE, what with hand-written SQL and what is C++, and where to find them in the CoA content hub. The old guide (14-World-boss-Setis-AWE) is kept because it holds the screenshots of the Setis case.
# 1. What a world boss is in CoA
It is an Ascension boss that, instead of being fought in the open world, lives in its own instanced map. The pattern is always the same:
- An altar or shrine in the open world that, when used, teleports players to the boss map (Normal difficulty only).
- The boss map, with its graveyard (if the raid dies, it respawns inside the map).
- The boss, with its C++ script and its loot rows.
- An exit portal that the script summons where the boss falls, and a second shrine at the map entrance to go back.
- One row per difficulty in the `coa_world_boss_level` table with its health and damage.
# 2. Where it is in AWE: the CoA content hub
In the top bar, **CoA content** gathers the CoA-specific content wizards. Inside it is the **World bosses** section, with the ready-made boss drafts (Azuregos, Kazzak and Soggoth) and the Setis model. Each draft takes you to the pieces the boss needs: creature, loot, shrine objects, graveyard and level row. The Model wizard (guide 15) is in the same hub, to give a new boss a model of its own. If the section does not appear, update AWE (guide 1).
What the hub does not write: the C++ of the boss and of the objects, which always lives in the server's `mod-coa-raid-difficulty` module.
# 3. Work map: what is done where
| Step | What it is | Tool
| 1 | Check the boss already exists (creature, script, map) | AWE (Find, SQL console) and the code
| 2 | Level template (`coa_world_boss_level`) | SQL; the module creates the table
| 3 | Loot | AWE for the basics; hand-written SQL for groups and modes
| 4 | Entrance shrine, portal and exit shrine | AWE for the objects and their placement; C++ for the scripts
| 5 | Graveyard (`game_graveyard`, `graveyard_zone`) | Hand-written SQL
| 6 | Boss abilities and scaling | C++
| 7 | Tests, SQL, verify_all and PR | Harness, repository and GitHub
# 4. The coa_world_boss_level table
It lives in the `mod-coa-raid-difficulty` module (`18_custom_world_bosses.sql`) and the `coa_world_boss_level_loader` script reads it when the server starts.
| Column | What it is
| entry | The boss entry in `creature_template`
| difficulty | 0 and 1: normal difficulties (10 and 25 normal); 2 and 3: heroic
| health | Boss health; on bosses with per-player scaling it is the health per player in the map (10 to 40)
| damage_pct | Boss damage as a percentage of the base value of its spells (100 = base)
| note | Free text: where the measurement comes from (for example, a kill log)
Real example from the module: `(64600, 0, 10504882, 75, 'kill 22:28, 15 players')` and `(64600, 2, 19509068, 93, ...)` for Setis. Soggoth later gets `health = 523000` per player on difficulty 0.
Note about the old guide: it said levels 68 and 71 came from this table. The table holds health and damage; the item levels (68 normal, 71 heroic) are in the loot and in `item_template`.
# 5. The shrines (altars) and the portal
Each boss uses three type 10 (goober) objects, all with a `ScriptName` that the C++ registers:
| Object | Role | ScriptName
| Shrine in the world | Takes players to the boss map; refuses the heroic difficulties | `go_<boss>_altar_coa`
| Exit portal | Summoned by the script on the boss corpse for 10 minutes; takes players back to the shrine | `go_<boss>_exit_coa`
| Entrance shrine | Inside the boss map; it also returns players to the world | `go_<boss>_leave_coa`
In AWE: create the objects with Add object (type Usable object), set the model in Look (Browse models or the Display ID), the script name in Details > Advanced > C++ script, and place the shrine with Placement > Place in world. The portal has no spawn: the script creates it. The spawn of the inner shrine (inside the boss map) goes in SQL.
Example (Soggoth): `(280144, 10, 4076, 'Shrine of Soggoth', ..., 'go_soggoth_altar_coa')` in Darkshore (map 1, 4548.8, 343.0, 48.7), `(978078, 10, 4396, 'Portal out of the Gastric Pit', ..., 'go_soggoth_exit_coa')` and `(978079, 10, 4076, 'Shrine of Soggoth', ..., 'go_soggoth_leave_coa')` on map 883.
# 6. The included drafts
The three drafts in CoA content come from the real files in `data/sql/updates/pending_db_world`.
| Boss | Entry | Map and graveyard | Shrine | Notes
| Azuregos | 64601 (kill credit 6109) | 881; graveyard 6081 | 280139, in Azshara, where he stands | 6109 stays in the open world. File: `rev_20261105_10_coa_azuregos_world_boss.sql`
| Kazzak | 64604 (credit 12397, HealthModifier 3200) | 882, Throne of the Doom Lord; graveyard 6082 | The Shrine of Lord Kazzak, in the Tainted Scar | Health around 476,000 per player. Shares loot with 12397. File: `rev_20261105_11_coa_kazzak_world_boss.sql`
| Soggoth | 64605 | 883, Master's Gastric Pit (zone 10238); graveyard 6083 | 280144, in Darkshore | 523,000 health per player; Normal only. File: `rev_20261105_12_coa_soggoth_world_boss.sql`
Setis (64600, map 880, zone 10235, graveyard 6099) was the first and best documented (section 9). Kaldros, Atalzul and Snowgrave follow the same pattern (files `rev_20261105_13`, `rev_20261107_14` and `rev_20261107_15`).
# 7. Loot and rewards
- A boss with one roll of its loot: `creature_loot_template` rows with `GroupId = 1`, `Chance = 0` (equal split) and `LootMode = 1`. Heroic rows (when they exist) go in a separate group with `LootMode = 2`.
- One extra roll for every four players in the map: the death script does it (`azuregos_instance_death_coa`, `kazzak_instance_death_coa`, `soggoth_instance_death_coa`). Setis used a different rule before: 2 to 8 items depending on the raid (`SetisLoot.h`).
- Every player receives Runes of Descension (called Runes of Ascension on Ascension; CoA renamed them), Bazaar Tokens and the Treasures of Azeroth chest (978059). That chest has a 5% chance to drop any world boss item (the 978060 list): the new boss's items join that group.
- To separate difficulties always use loot modes (`LootMode`), never type 49 conditions: they do not stop the server from generating the item, they only hide it.
# 8. Health and damage scaling (ApexScaling)
For new bosses with their own C++, CoA reuses the ApexScaling helper: boss damage is measured as a percentage of the victim's maximum health, a 15-second DPS probe sets the boss's health pool for the target time to kill, and StartApexPull / KeepApexChase control the fight and the chase so the boss cannot run off. When a boss has measured numbers (Ascension logs), the `coa_world_boss_level` table is used instead. Choose one per boss: the table comes from a real log; ApexScaling is for when there is no log.
# 9. Full example: Setis
Summary of the original case, to use as a model. The screenshots are in the old guide.
## 9.1 Check what exists
The boss is creature 64600 "Setis", with its script `boss_setis_coa` in `modules/mod-coa-raid-difficulty/src/boss_world_custom_coa.cpp`. His map is 880, an instanced copy of Silithus (zone 10235). With AWE: Find with the name (the original #14471 and the world boss #64600) and, in Tables > SQL console, `SELECT entry, name, lootid, ScriptName FROM creature_template WHERE entry = 64600;`.
## 9.2 Loot
Nine level 68 items in group 1 with `LootMode = 1`; the heroic version is the same IDs plus 300000 (level 71) in group 2 with `LootMode = 2`. For two items per kill the SQL copies the rows into groups 3 and 4 (group + 2). The script enables `LOOT_MODE_HARD_MODE_1` on a heroic map. The Loot tab of the NPC editor only writes `LootMode = 1` and `GroupId = 0`, so groups and modes are written by hand or through the MCP tools (guide 11).
```
UPDATE creature_template SET lootid = 64600 WHERE entry = 64600;
DELETE FROM creature_loot_template WHERE Entry = 64600;
INSERT INTO creature_loot_template (Entry, Item, Reference, Chance, QuestRequired, LootMode, GroupId, MinCount, MaxCount, Comment)
VALUES (64600, 17365, 0, 0, 0, 1, 1, 1, 1, 'Setis - Amulet of the Gate Warden'),
       (64600, 317365, 0, 0, 0, 2, 2, 1, 1, 'Setis (heroic) - Amulet of the Gate Warden');
```
## 9.3 Altar and portal
Altar of Setis (64600, display 2490, `go_setis_altar_coa`) on map 1 at -7944, 1270, -3, which takes players to map 880 at -8093, 1663.6, 12.9; Portal to the Scarab Wall (64601, display 3931, `go_setis_exit_coa`), summoned on the corpse for 600 s with `SummonGameObject`.
## 9.4 Graveyard
AWE has no editor for these tables: write them by hand.
```
DELETE FROM game_graveyard WHERE ID = 6099;
INSERT INTO game_graveyard (ID, Map, x, y, z, Comment) VALUES (6099, 880, -8093.0, 1663.6, 12.9, 'Setis boss map - start');
DELETE FROM graveyard_zone WHERE ID = 6099;
INSERT INTO graveyard_zone (ID, GhostZone, Faction, Comment) VALUES (6099, 10235, 0, 'The Scarab Wall (Setis boss map)');
```
## 9.5 Abilities
They are C++ (`boss_world_custom_coa.cpp`). With AWE you look up the spells: Spells tab, Find and Effects. The AuraScript `spell_setis_prismatic_barrier_coa` is linked with six `spell_script_names` rows (spells 2119031 to 2119036), which you can create in Tables > Spell script names.
| Ability | Spells | What it does
| Seeking Shadow Bolts | 2119001, 2119002 | Every 21 s, 2119002 on each player within 100 yd
| Split Meteor | 2119010, 2119006, 2119013 | Impact 3 s later; the total damage is split among those hit within 8 yd
| Massive Thunder Stomp | 2119022 to 2119029 | Every 45 s: tank, distance-attenuated damage and knockback
| Prismatic Barrier | 2119030 to 2119038 | Below 50%, every 15 s it switches school among six auras
# 10. Tests, SQL and PR
1. Gather all the rows in one file `data/sql/updates/pending_db_world/rev_YYYYMMDD_NN_coa_<boss>_world_boss.sql`, with a DELETE before each block so it can run more than once.
2. Write the harness scenarios (`apps/coa-gameplay-test/scenarios/`): entry, loot and exit, and the abilities. Harness players live in a private phase, so use `spawn_active` for the shrine.
3. Pass the SQL lints and `verify_all`, and paste the "VERIFY ALL" result into the PR.
4. Bring the branch up to date with main and check the open PRs that touch the same things. Open the PR only with the maintainer's approval and answer CodeRabbit in English (lines of 120 columns at most). No explanatory comments in the C++ and no AI attribution in commits or PRs.
5. The PR must carry every row it depends on; the harness uses a copy of the local database and can hide missing ones.
# 11. Heroic version
Today the new world bosses only open Normal: the shrines refuse the heroic difficulties. To open heroic the map needs a heroic difficulty (MapDifficulty, which AWE does not edit), you must decide how it is chosen, and test the flow with the harness: entry, health and damage of the `difficulty` 2 or 3 row, `LootMode = 2` and heroic items.
# 12. Common mistakes
| Problem | Cause and fix
| An item of the wrong difficulty drops | A type 49 condition was used. Use LootMode and SetLootMode in the script
| All items drop at once | Groups are missing: each group gives at most one item. Set GroupId and Chance = 0
| The shrine does not teleport | The C++ script is missing or wrong, or the server was not restarted after the SQL
| The exit portal does not appear | The code summons it when the boss dies: it has no database spawn
| The raid respawns far away after wiping | The graveyard is missing or wrong: `game_graveyard` and `graveyard_zone` with the map's zone
| The boss has too little or too much health | Check its row in `coa_world_boss_level` for that difficulty
| I cannot find the spell | It is only in `spell_dbc` or the Server data folder is wrong (guide 9)
| The PR fails an ID check | Another change already uses that ID. Use Free ids and export again (guides 10 and 12)
# 13. How to test it in game
1. Apply the SQL to your test database and restart the worldserver with the compiled module.
2. Go to the shrine with `.go xyz` (the boss shrine coordinates), use it and check that you appear at the entrance of the boss map.
3. Kill the boss on normal: check the loot, each ability, and that the portal appears for 10 minutes.
4. Use the portal and check that you return next to the shrine.
5. Wipe the raid: release, check that you revive at the map entrance and can walk back in.
