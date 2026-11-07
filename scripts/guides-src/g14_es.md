TITLE: World bosses con AWE: de Setis a cualquier jefe
Esta guía es la versión generalizada de la guía 14 original (Setis). Explica el patrón que comparten los world bosses de CoA (Setis, Azuregos, Kazzak, The Will of Soggoth...), qué se hace con AWE, qué con SQL a mano y qué es C++, y dónde encontrarlos en el centro CoA content. La guía antigua (14-Worldboss-Setis-AWE) se conserva porque tiene las capturas del caso Setis.
# 1. Qué es un world boss en CoA
Es un jefe de Ascension que, en lugar de pelearse en el mundo abierto, vive en su propio mapa instanciado. El patrón es siempre el mismo:
- Un altar o santuario en el mundo abierto que, al usarse, teletransporta a los jugadores al mapa del jefe (solo en dificultad normal).
- El mapa del jefe, con su cementerio (si la banda muere, reaparece dentro del mapa).
- El jefe, con su script C++ y sus filas de loot.
- Un portal de salida que el script invoca donde cae el jefe, y un segundo santuario en la entrada del mapa para volver.
- Una fila por dificultad en la tabla `coa_world_boss_level` con su vida y su daño.
# 2. Dónde está en AWE: el centro CoA content
En la barra superior, **CoA content** reúne los asistentes de contenido propio de CoA. Dentro de él está la sección de **World bosses**, con los borradores de los jefes ya montados (Azuregos, Kazzak y Soggoth) y el modelo de Setis. Cada borrador te lleva a las piezas que necesita el jefe: criatura, loot, objetos del altar, cementerio y fila de nivel. El asistente de modelos (Model wizard, guía 15) está en el mismo centro, para dar un modelo propio a un jefe nuevo. Si la sección no aparece, actualiza AWE (guía 1).
Lo que el centro no escribe: el C++ del jefe y de los objetos, que siempre va en el módulo `mod-coa-raid-difficulty` del servidor.
# 3. Mapa del trabajo: qué se hace dónde
| Paso | Qué es | Herramienta
| 1 | Comprobar que el jefe ya existe (criatura, script, mapa) | AWE (Find, SQL console) y el código
| 2 | Plantilla de nivel (`coa_world_boss_level`) | SQL; la tabla la crea el módulo
| 3 | Loot | AWE para lo básico; SQL a mano para grupos y modos
| 4 | Santuario de entrada, portal y santuario de salida | AWE para los objetos y su colocación; C++ para los scripts
| 5 | Cementerio (`game_graveyard`, `graveyard_zone`) | SQL a mano
| 6 | Habilidades del jefe y escalado | C++
| 7 | Pruebas, SQL, verify_all y PR | Arnés, repositorio y GitHub
# 4. La tabla coa_world_boss_level
Está en el módulo `mod-coa-raid-difficulty` (`18_custom_world_bosses.sql`) y el script `coa_world_boss_level_loader` la lee al arrancar el servidor.
| Columna | Qué es
| entry | La entrada del jefe en `creature_template`
| difficulty | 0 y 1: dificultades normales (10 y 25 normal); 2 y 3: heroicas
| health | Vida del jefe; en los jefes con escalado por jugador es la vida por jugador del mapa (10 a 40)
| damage_pct | Daño del jefe en porcentaje sobre el valor base de sus hechizos (100 = el base)
| note | Texto libre: de dónde sale la medida (por ejemplo, el registro de una muerte)
Ejemplo real del módulo: `(64600, 0, 10504882, 75, 'kill 22:28, 15 players')` y `(64600, 2, 19509068, 93, ...)` para Setis. Soggoth tiene después `health = 523000` por jugador en dificultad 0.
Nota de la guía antigua: allí se decía que los niveles 68 y 71 salían de esta tabla. Lo que contiene la tabla es vida y daño; los niveles de los objetos (68 normal, 71 heroico) están en el loot y en `item_template`.
# 5. Los santuarios (altares) y el portal
Cada jefe usa tres objetos de tipo 10 (goober), todos con `ScriptName` que registra el C++:
| Objeto | Función | ScriptName
| Santuario en el mundo | Lleva al mapa del jefe; rechaza las dificultades heroicas | `go_<jefe>_altar_coa`
| Portal de salida | Lo invoca el script en el cadáver del jefe durante 10 minutos; lleva de vuelta al santuario | `go_<jefe>_exit_coa`
| Santuario de la entrada | Está dentro del mapa del jefe y también devuelve al mundo | `go_<jefe>_leave_coa`
En AWE: crea los objetos con Add object (tipo Usable object), pon el modelo en Look (Browse models o el Display ID), el nombre del script en Details > Advanced > C++ script y coloca el santuario con Placement > Place in world. El portal no tiene spawn: lo crea el script. El spawn del santuario interior (dentro del mapa del jefe) sí va en SQL.
Ejemplo (Soggoth): `(280144, 10, 4076, 'Shrine of Soggoth', ..., 'go_soggoth_altar_coa')` en Darkshore (mapa 1, 4548.8, 343.0, 48.7), `(978078, 10, 4396, 'Portal out of the Gastric Pit', ..., 'go_soggoth_exit_coa')` y `(978079, 10, 4076, 'Shrine of Soggoth', ..., 'go_soggoth_leave_coa')` en el mapa 883.
# 6. Los borradores incluidos
Los tres borradores de CoA content salen de los archivos reales de `data/sql/updates/pending_db_world`.
| Jefe | Entrada | Mapa y cementerio | Santuario | Notas
| Azuregos | 64601 (crédito de muerte 6109) | 881; cementerio 6081 | 280139, en Azshara, donde él está | El 6109 sigue en el mundo abierto. Archivo: `rev_20261105_10_coa_azuregos_world_boss.sql`
| Kazzak | 64604 (crédito 12397, HealthModifier 3200) | 882, Throne of the Doom Lord; cementerio 6082 | El Shrine of Lord Kazzak, en Tainted Scar | Vida del orden de 476.000 por jugador. Comparte loot con el 12397. Archivo: `rev_20261105_11_coa_kazzak_world_boss.sql`
| Soggoth | 64605 | 883, Master's Gastric Pit (zona 10238); cementerio 6083 | 280144, en Darkshore | 523.000 de vida por jugador; solo Normal. Archivo: `rev_20261105_12_coa_soggoth_world_boss.sql`
Setis (64600, mapa 880, zona 10235, cementerio 6099) fue el primero y el más documentado (sección 9). Kaldros, Atalzul y Snowgrave siguen el mismo patrón (archivos `rev_20261105_13`, `rev_20261107_14` y `rev_20261107_15`).
# 7. Loot y recompensas
- Jefe con una tirada de su botín: filas de `creature_loot_template` con `GroupId = 1`, `Chance = 0` (reparto igual) y `LootMode = 1`. Los heroicos (cuando existan) van en un grupo aparte con `LootMode = 2`.
- Una tirada más por cada cuatro jugadores del mapa: la hace el script de muerte (`azuregos_instance_death_coa`, `kazzak_instance_death_coa`, `soggoth_instance_death_coa`). Setis usó antes otra regla: de 2 a 8 objetos según la banda (`SetisLoot.h`).
- Todos los jugadores reciben las Runes of Descension (en Ascension se llaman Runes of Ascension; CoA las renombró), Bazaar Tokens y el cofre Treasures of Azeroth (978059). Ese cofre tiene un 5 % de probabilidad de soltar cualquier objeto de world boss (la lista 978060): los objetos del nuevo jefe se añaden a ese grupo.
- Para separar dificultades usa siempre modos de botín (`LootMode`), nunca conditions de tipo 49: no impiden que el servidor genere el objeto, solo lo ocultan.
# 8. Escalado de la vida y del daño (ApexScaling)
Para jefes nuevos con C++ propio, CoA reutiliza el ayudante ApexScaling: el daño del jefe se mide como porcentaje de la vida máxima de la víctima, una sonda de DPS de 15 segundos fija la reserva de vida del jefe para el tiempo de muerte objetivo, y StartApexPull / KeepApexChase controlan el combate y la persecución para que no se escape. Cuando un jefe tiene los números medidos (registros de Ascension), se usa en cambio la tabla `coa_world_boss_level`. Elige uno de los dos por jefe: el que mide sale de un registro real; ApexScaling sirve cuando no hay registro.
# 9. Ejemplo completo: Setis
Resumen del caso original, para usarlo como modelo. Las capturas están en la guía antigua.
## 9.1 Comprobar lo que existe
El jefe es la criatura 64600 "Setis", con su script `boss_setis_coa` en `modules/mod-coa-raid-difficulty/src/boss_world_custom_coa.cpp`. Su mapa es el 880, una copia instanciada de Silithus (zona 10235). Con AWE: Find con el nombre (la original #14471 y la del world boss #64600) y, en Tables > SQL console, `SELECT entry, name, lootid, ScriptName FROM creature_template WHERE entry = 64600;`.
## 9.2 Loot
Nueve objetos de nivel 68 en el grupo 1 con `LootMode = 1`; la versión heroica son los mismos IDs más 300000 (nivel 71) en el grupo 2 con `LootMode = 2`. Para dos objetos por muerte el SQL copia las filas a los grupos 3 y 4 (grupo + 2). El script activa `LOOT_MODE_HARD_MODE_1` en mapa heroico. La pestaña Loot del editor de NPC solo escribe `LootMode = 1` y `GroupId = 0`, así que los grupos y modos se escriben a mano o por las herramientas MCP (guía 11).
```
UPDATE creature_template SET lootid = 64600 WHERE entry = 64600;
DELETE FROM creature_loot_template WHERE Entry = 64600;
INSERT INTO creature_loot_template (Entry, Item, Reference, Chance, QuestRequired, LootMode, GroupId, MinCount, MaxCount, Comment)
VALUES (64600, 17365, 0, 0, 0, 1, 1, 1, 1, 'Setis - Amulet of the Gate Warden'),
       (64600, 317365, 0, 0, 0, 2, 2, 1, 1, 'Setis (heroic) - Amulet of the Gate Warden');
```
## 9.3 Altar y portal
Altar of Setis (64600, display 2490, `go_setis_altar_coa`) en el mapa 1, -7944, 1270, -3, que lleva al mapa 880 en -8093, 1663.6, 12.9; Portal to the Scarab Wall (64601, display 3931, `go_setis_exit_coa`), invocado en el cadáver durante 600 s con `SummonGameObject`.
## 9.4 Cementerio
AWE no tiene editor para estas tablas: se escriben a mano.
```
DELETE FROM game_graveyard WHERE ID = 6099;
INSERT INTO game_graveyard (ID, Map, x, y, z, Comment) VALUES (6099, 880, -8093.0, 1663.6, 12.9, 'Setis boss map - start');
DELETE FROM graveyard_zone WHERE ID = 6099;
INSERT INTO graveyard_zone (ID, GhostZone, Faction, Comment) VALUES (6099, 10235, 0, 'The Scarab Wall (Setis boss map)');
```
## 9.5 Habilidades
Son C++ (`boss_world_custom_coa.cpp`). Con AWE se consultan los hechizos: pestaña Spells, Find y Effects. El AuraScript `spell_setis_prismatic_barrier_coa` se enlaza con seis filas de `spell_script_names` (hechizos 2119031 a 2119036), que sí se pueden crear en Tables > Spell script names.
| Habilidad | Hechizos | Qué hace
| Seeking Shadow Bolts | 2119001, 2119002 | Cada 21 s, 2119002 a cada jugador a menos de 100 yd
| Meteoro dividido | 2119010, 2119006, 2119013 | Impacto 3 s después; el daño total se reparte entre los alcanzados a 8 yd
| Massive Thunder Stomp | 2119022 a 2119029 | Cada 45 s: tanque, daño atenuado por distancia y empuje
| Prismatic Barrier | 2119030 a 2119038 | Bajo el 50 %, cada 15 s cambia de escuela entre seis auras
# 10. Pruebas, SQL y PR
1. Reúne todas las filas en un archivo `data/sql/updates/pending_db_world/rev_AAAAMMDD_NN_coa_<jefe>_world_boss.sql`, con un DELETE antes de cada bloque para poder ejecutarlo varias veces.
2. Escribe los escenarios del arnés (`apps/coa-gameplay-test/scenarios/`): entrada, loot y salida, y las habilidades. Los jugadores del arnés viven en una fase privada, así que usa `spawn_active` para el altar.
3. Pasa los lints del SQL y `verify_all`, y pega el resultado "VERIFY ALL" en el PR.
4. Pon la rama al día con main y revisa las PR abiertas que toquen lo mismo. Abre el PR solo con el visto bueno del responsable y responde en inglés a CodeRabbit (líneas de 120 columnas como máximo). Sin comentarios explicativos en el C++ y sin atribución de IA en commits ni en PR.
5. El PR debe llevar todas las filas de las que depende; el arnés usa una copia de la base local y puede ocultar las que falten.
# 11. Versión heroica
Hoy los world bosses nuevos solo abren Normal: los santuarios rechazan las dificultades heroicas. Para abrir la heroica hace falta dar al mapa una dificultad heroica (MapDifficulty, que AWE no edita), decidir cómo se elige, y probar el flujo con el arnés: entrada, vida y daño de la fila con `difficulty` 2 o 3, `LootMode = 2` y objetos heroicos.
# 12. Errores comunes
| Problema | Causa y solución
| Cae un objeto de la dificultad equivocada | Se usó una condition de tipo 49. Usa LootMode y SetLootMode en el script
| Caen todos los objetos a la vez | Faltan los grupos: cada grupo da un máximo de un objeto. Pon GroupId y Chance = 0
| El santuario no teletransporta | Falta o está mal el C++ script, o no se reinició el servidor tras el SQL
| El portal de salida no aparece | Lo invoca el código al morir el jefe: no tiene spawn en la base de datos
| Al morir la banda reaparece lejos | Falta o está mal el cementerio: `game_graveyard` y `graveyard_zone` con la zona del mapa
| El jefe tiene poca o demasiada vida | Revisa su fila en `coa_world_boss_level` para esa dificultad
| No encuentro el hechizo | Está solo en `spell_dbc` o la Server data folder no es la correcta (guía 9)
| El PR falla en una comprobación de IDs | Otro cambio ya usa ese ID. Usa Free ids y vuelve a exportar (guías 10 y 12)
# 13. Cómo probarlo en el juego
1. Aplica el SQL a tu base de pruebas y reinicia el worldserver con el módulo compilado.
2. Ve al santuario con `.go xyz` (coordenadas del santuario del jefe), úsalo y comprueba que apareces en la entrada del mapa del jefe.
3. Mata al jefe en normal: comprueba el loot, cada habilidad y que aparece el portal 10 minutos.
4. Usa el portal y comprueba que vuelves junto al santuario.
5. Haz caer a la banda: libera, comprueba que revives en la entrada del mapa y que puedes volver a entrar andando.
