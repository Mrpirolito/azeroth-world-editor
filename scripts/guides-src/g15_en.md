TITLE: Mounts, pets and NPCs with a custom model
This guide covers the full path, on the 3.3.5a client (build 12340), to add a mount, a companion pet or an NPC whose model the game does not ship: from the M2 file to the spell, the item and the client patch. At the end comes the new AWE wizard (CoA content > Model wizard), which writes the database and DBC rows for you. Important: retail models belong to Blizzard. Read the limits section before you start.
# 1. The pieces you need
A new model in WotLK has four layers. If one is missing you get an invisible model, a white one or a client crash.
| Layer | What it is | Where it lives
| Model files | `.m2` (version 264) + `.skin` + `.blp` textures | Client patch (MPQ)
| Client DBC tables | CreatureModelData, CreatureDisplayInfo (and CreatureDisplayInfoExtra for humanoids) | Client MPQ and the server dbc folder
| Server database | creature_template, creature_template_model, creature_model_info | acore_world database
| Playable content | The mount or companion spell, and the item that teaches it | Spell.dbc / spell_dbc, item_template and Item.dbc / item_dbc
# 2. The model: M2 version 264 and .skin files
The 3.3.5a client only reads M2 version 264 (WotLK). Current retail models are much newer (chunked format, textures by FileDataID, skins and animations in separate files) and will not open as they are: you have to convert them down.
## 2.1 Extracting the model from a legitimate retail client
- Use an open-source extraction tool such as wow.export, pointed at a retail install you own legitimately. It previews the model and exports it (M2, skins and textures) without touching the client.
- Write down the name and source folder. Later you will pick a folder of your own for the patch, for example `Creature\MyMount\`.
## 2.2 Downporting to WotLK
There are two routes, and both give you an M2 264 plus its `.skin` files:
- Blender with a WoW M2 import/export add-on (for example the WBS family or other M2 tools for Blender). You import the model, check bones, animations and materials, and export choosing the WotLK version (264). This gives the most control.
- Dedicated community converters, in the style of M2Mod or the multi-model converters. They are faster but fail more often with animations and very new models. Always test the result.
When you export, check that you get: the `.m2`, one `.skin` per level of detail (`MyMount00.skin`, sometimes `01`, `02`...) and the external animation files (`MyMount0000-00.anim`) if the model uses them.
## 2.3 What to check in the model
- Version: exactly 264. An M2 of any other version crashes the client when it is seen.
- Triangles: aim for under 10,000 per model. More works, but with many mounts on screen the frame rate drops.
- Bones and animations: the skeleton must have the animations the game asks for (see the limits section).
- Textures: path and type in the M2 texture table (section 3).
# 3. BLP textures
- BLP2 format. DXT1 compression (no transparency) or DXT5 (smooth transparency). For one-bit alpha, DXT1 with alpha works.
- Width and height must be powers of two (64, 128, 256, 512, 1024) and at most 1024. They do not need to be square, but each side must be a power of two.
- With generated mipmaps. A BLP without mipmaps looks fine close up and bad at a distance.
- Convert PNG or TGA to BLP with a BLP converter or a plugin for your image editor.
- Texture path: in the M2, type 0 textures carry a fixed path (`Creature\MyMount\MyMountBase.blp`). Types 11, 12 and 13 (creature skin) are filled from CreatureDisplayInfo through TextureVariation1, 2 and 3, without extension and relative to the model folder. That way one M2 serves several colours.
# 4. Client DBC tables
You edit them with AWE (Model wizard) or any DBC editor. The M2 is referenced by the CreatureModelData path; DBC paths use `.mdx` even though the file is `.m2` (the client translates it).
## 4.1 CreatureModelData
One row per model. The fields that matter:
| Field | Value
| ID | A free ID (use Free ids in AWE, or look up the maximum)
| ModelName | `Creature\MyMount\MyMount.mdx`
| ModelScale | 1.0 at first; adjust later if it comes out too big or small
| CollisionWidth, CollisionHeight | Collision box; copy from a similar model
| MountHeight | Height where the rider sits: only matters for mounts; copy from a mount of the same size
| GeoBox (6 values) | Model box; copy from a similar one or take it from the M2
| SizeClass, BloodID, FootprintTextureID | Copy them from a similar model; 0 if unsure
## 4.2 CreatureDisplayInfo
One row per look. ModelID points at the CreatureModelData row, TextureVariation1-3 is the texture name (no extension), ExtendedDisplayInfoID is 0 except for humanoids, and CreatureModelScale is the final size (1 = the CreatureModelData one). A model with three colours is three DisplayInfo rows and one ModelData row.
## 4.3 CreatureDisplayInfoExtra (humanoids only)
Only if the model is a race-based character (a humanoid NPC with skin, face and gear). Each row defines race, sex, skin, face, hair, facial hair and the item worn in each slot. Put its ID in ExtendedDisplayInfoID of the CreatureDisplayInfo row. For mounts, pets and monsters it stays 0 and you do not create it.
# 5. Server database
## 5.1 The creature
- `creature_template`: the entry (a free ID). A minimal record is enough for a mount: name, level, `faction` 35, `npcflag` 0. For a companion pet set `type` 12 (non-combat pet) and `faction` 35.
- `creature_template_model`: columns `CreatureID`, `Idx`, `CreatureDisplayID`, `DisplayScale`, `Probability`. One row per look (Idx 0, 1, 2...) with the CreatureDisplayInfo ID from section 4.
- `creature_model_info`: one row per DisplayID with `BoundingRadius`, `CombatReach` and `Gender` (2 = genderless). If it is missing the server uses defaults and the box or reach come out wrong.
- Equipped NPC: add `creature_equip_template`. NPC in the world: a spawn in `creature` (guide 7).
## 5.2 The mount spell
It goes in `spell_dbc` (CoA) and in Spell.dbc. The safest way is to copy an existing mount spell of the same kind and change only these fields:
| Field | Value
| Effect1 | 6 (SPELL_EFFECT_APPLY_AURA)
| EffectAura1 | 78 (SPELL_AURA_MOUNTED)
| EffectMiscValue1 | The mount's creature_template entry
| Effect2 / EffectAura2 | 6 / 32 (MOD_INCREASE_MOUNTED_SPEED): ground speed; EffectBasePoints is the percentage minus one (59 = +60%)
| Effect3 / EffectAura3 | 6 / 207: flying speed if the mount flies
| Attributes, ShapeshiftMask, AuraInterruptFlags | Those of the spell you copied (dismount on damage, on shapeshift, etc.)
Base speed comes from the percentage of aura 32 (or 207): 59 for +60%, 99 for +100%, 149 for +150%.
## 5.3 The companion pet spell
Copy an existing companion spell (the one that teaches a game pet). The scheme is: a summon effect (SPELL_EFFECT_SUMMON, 28), EffectMiscValue with the creature entry and EffectMiscValueB with the companion summon properties (SummonProperties; copy the value of the original spell, usually 64). The rest (range, duration 0, attributes) is copied too.
## 5.4 The item
In `item_template` copy an existing mount or pet item and change name, `displayid` and icon. The learn pattern is:
| Field | Value
| class / subclass | 15 / 5 for mounts, 15 / 2 for companion pets
| spellid_1 / spelltrigger_1 | 483 (the learning spell) / 0 (on use)
| spellid_2 / spelltrigger_2 | The mount or pet spell / 6 (learn spell)
| spellcharges_1 | -1 (consumed on use)
| bonding | 1 if it should bind on pickup
Because of how the client reads it, the item also needs a row in Item.dbc (or in CoA's `item_dbc` table) with its ID, class, subclass, DisplayInfoID and InventoryType. Without that row the item shows a "?" icon. In CoA the ID must also be registered in the client item patch (`ClientItemPatches`).
# 6. Client patch (MPQ)
Everything the client needs goes in an MPQ in the `Data` folder named `patch-X.MPQ` (a letter or a number; the client loads patches in order and the last one wins). The paths inside the MPQ are the same as in the game:
| Path in the MPQ | What it is
| `Creature\MyMount\MyMount.m2` | The model (version 264)
| `Creature\MyMount\MyMount00.skin` | The skin (and the others: `01`, `02`...)
| `Creature\MyMount\MyMountBase.blp` | The textures
| `DBFilesClient\CreatureModelData.dbc` | The table with your row
| `DBFilesClient\CreatureDisplayInfo.dbc` | The table with your rows
| `DBFilesClient\Spell.dbc` | Only if the spell does not arrive through the CoA patch
| `DBFilesClient\Item.dbc` | Same for the item
When you change the MPQ, close the game and delete the `Cache` folder (or `Cache\WDB`): the client stores creature and item data there, and if you do not delete it, it keeps showing the old version. Also copy the modified DBCs to the server `dbc` folder so server and client agree.
# 7. The AWE wizard: CoA content > Model wizard
This wizard puts steps 4, 5 and 6 together. You need the Server data folder and the Game client folder set (guide 1). The exact field names may vary between versions; the order is always the same.
1. In the top bar open **CoA content** and choose **Model wizard**.
2. Choose the kind of result: **Mount**, **Companion pet** or **NPC**. The wizard shows only the fields that kind needs.
3. Click the model picker and choose the `.m2` you downported to 264. AWE checks the version, finds the `.skin` files and lists the textures the M2 asks for. If something is missing or the version is not 264 it tells you here and does not let you continue.
4. Choose the BLP textures for each slot. If the model has several colours, add one look per colour.
5. Enter the name and let the wizard reserve the free IDs: the creature's, CreatureModelData's, CreatureDisplayInfo's and, if needed, the spell's and the item's. You can change them by hand.
6. Adjust the scale and, for a mount, the rider height and the speeds (ground and flying). The 3D preview shows the model with those values.
7. For a humanoid NPC, fill in race, sex and gear to create the CreatureDisplayInfoExtra row.
8. Review the summary: it lists the database rows (creature_template, creature_template_model, creature_model_info, spell_dbc, item_template) and the DBC rows it will write.
9. Click generate. The wizard adds the rows to the project, writes the SQL together with the rest of your changes, and leaves a folder with the patch files ready to pack into the MPQ (`Creature\...` and `DBFilesClient\...`).
10. Pack that folder into `patch-X.MPQ` with an MPQ editor, copy the MPQ to `Data`, delete `Cache`, apply the SQL, restart the worldserver and test (section 10).
Everything the wizard generates enters the project like any other change: it can be undone (Ctrl+Z) and exported with Export (guide 10).
# 8. Limits
## 8.1 Legality
- Retail models and textures belong to Blizzard Entertainment. Use them only in private, on your own test server.
- Never redistribute them: not in a patch for players, not in a public repository, not in a PR. Commit only the SQL and database rows, not the M2, BLP or MPQ files.
- If you want to share, use your own models or models with a licence that allows it. This guide describes general tools and links to no downloads.
## 8.2 Bones and animations
- The game asks for animations by ID. The basics: 0 (Stand), 4 (Walk), 5 (Run), 37-39 (jump: start, in the air, landing). If one is missing, the model stands still or falls into a T-pose when it is triggered.
- A flying mount also needs its flight animations (hovering and moving forward). Copy the IDs from a flying mount converted with the same tool.
- The rider sits on an attachment point of the model and takes the mounted animation. Without that attachment the rider ends up on the ground or in the middle of the model. Height is tuned with MountHeight (section 4.1).
- Retail models with very modern rigs can lose animations when downported: check the result in Blender or in AWE's viewer before packing.
## 8.3 Polygons and textures
- Target: under 10,000 triangles per model. Mounts are often seen in groups.
- Textures: power of two, at most 1024 per side, DXT1 or DXT5. A 2048 texture, or one that is not a power of two, shows white or drops the frame rate.
- Every extra texture and material is one more draw call. Merge textures into an atlas if you can.
# 9. Troubleshooting
| Symptom | Cause and fix
| Invisible model | The ModelName path does not match the MPQ one, the `.skin` is missing, or the MPQ is not loaded (it must be named `patch-X.MPQ` and sit in `Data`). Delete `Cache`
| Green, black or white texture | The BLP is not BLP2, not a power of two, bigger than 1024, or the path/TextureVariation does not match the file name
| Client closes when it sees the model | The M2 is not version 264, or the `.skin` does not belong to that M2
| A different model shows | Another row uses the same DisplayInfo ID, or the client keeps the old value in `Cache`
| You mount but see no mount | The spell's EffectMiscValue is not the creature entry, or creature_template_model is missing
| Mount too big or too small | Adjust ModelScale, CreatureModelScale and DisplayScale; rider height is MountHeight
| The pet does not appear | `type` 12 is missing or the spell's summon property is not the companion one; copy a real companion spell
| Item shows a "?" icon | The Item.dbc / `item_dbc` row or the client registration is missing
| Changes do not apply | After changing the SQL restart the worldserver and, if you changed DBCs, copy them to the server `dbc` folder too
# 10. How to test it in game
1. Apply the SQL to your test database, copy the DBCs to the server and restart the worldserver.
2. Copy `patch-X.MPQ` to `Data`, delete `Cache` and log in.
3. Get the item with the GM command `.additem` and use it; or learn the spell with `.learn` and cast the mount or pet.
4. Check: the model shows, the texture is right, the rider sits at the right height, the mount walks, runs, jumps and (if it flies) flies and stops.
5. Test dismounting, and test after relogging (the learned spell must still be in the spellbook).
