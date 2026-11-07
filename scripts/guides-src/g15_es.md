TITLE: Monturas, mascotas y NPCs con modelo propio
Esta guía explica el recorrido completo, en el cliente 3.3.5a (build 12340), para meter en CoA una montura, una mascota de compañía o un NPC con un modelo que el juego no trae: del archivo M2 al hechizo, al objeto y al parche del cliente. Al final está el asistente nuevo de AWE (CoA content > Model wizard), que escribe por ti las filas de base de datos y de DBC. Aviso importante: los modelos de retail son de Blizzard. Lee la sección de límites antes de empezar.
# 1. Qué piezas hacen falta
Un modelo nuevo en WotLK son cuatro capas. Si falta una, el resultado es un modelo invisible, blanco o un cierre del cliente.
| Capa | Qué es | Dónde vive
| Archivos del modelo | `.m2` (versión 264) + `.skin` + texturas `.blp` | Parche del cliente (MPQ)
| Tablas DBC del cliente | CreatureModelData, CreatureDisplayInfo (y CreatureDisplayInfoExtra si es humanoide) | MPQ del cliente y carpeta dbc del servidor
| Base de datos del servidor | creature_template, creature_template_model, creature_model_info | Base acore_world
| Contenido jugable | Hechizo de montura o de mascota, y el objeto que lo enseña | Spell.dbc / spell_dbc, item_template e Item.dbc / item_dbc
# 2. El modelo: M2 versión 264 y archivos .skin
El cliente 3.3.5a solo lee M2 de la versión 264 (WotLK). Los modelos de retail actuales son mucho más nuevos (formato por trozos, texturas por FileDataID, skins y animaciones en archivos aparte) y no abren tal cual: hay que bajarlos de versión.
## 2.1 Sacar el modelo de un cliente retail legítimo
- Usa una herramienta de extracción de código abierto, como wow.export, apuntada a una instalación de retail que tengas de forma legítima. Permite previsualizar el modelo y exportarlo (M2, skins y texturas) sin tocar el cliente.
- Anota el nombre y la carpeta de origen. Más tarde elegirás una carpeta propia para el parche, por ejemplo `Creature\MiMontura\`.
## 2.2 Bajarlo a WotLK
Hay dos caminos y los dos dan un M2 264 más sus `.skin`:
- Blender con un complemento de importación y exportación de M2 de WoW (por ejemplo, los de la serie WBS o las herramientas M2 para Blender). Importas el modelo, revisas huesos, animaciones y materiales, y exportas eligiendo la versión WotLK (264). Es el camino que más control da.
- Convertidores dedicados de la comunidad, del estilo de M2Mod o de los multiconversores de modelos. Son más rápidos, pero fallan más con animaciones y con modelos muy nuevos. Prueba siempre el resultado.
Al exportar comprueba que salen: el `.m2`, un `.skin` por nivel de detalle (`MiMontura00.skin`, a veces `01`, `02`...) y los archivos de animación externos (`MiMontura0000-00.anim`) si el modelo los usa.
## 2.3 Qué hay que revisar en el modelo
- Versión: 264 exacto. Un M2 de otra versión cuelga el cliente al verlo.
- Triángulos: apunta a menos de 10.000 por modelo. Más de eso funciona, pero con muchas monturas a la vez baja los fotogramas.
- Huesos y animaciones: el esqueleto debe tener las animaciones que el juego pide (véase la sección de límites).
- Texturas: ruta y tipo en la tabla de texturas del M2 (sección 3).
# 3. Texturas BLP
- Formato BLP2. Compresión DXT1 (sin transparencia) o DXT5 (con transparencia suave). Para alfa de un bit sirve DXT1 con alfa.
- Anchura y altura potencia de dos (64, 128, 256, 512, 1024) y de máximo 1024. Cuadradas no hace falta, pero sí potencias de dos en cada lado.
- Con mipmaps generados. Un BLP sin mipmaps se ve bien de cerca y mal de lejos.
- Convierte los PNG o TGA a BLP con una herramienta de conversión BLP o con un complemento de tu editor de imágenes.
- Ruta de la textura: en el M2 las texturas de tipo 0 llevan una ruta fija (`Creature\MiMontura\MiMonturaBase.blp`). Las de tipo 11, 12 y 13 (piel de criatura) se rellenan desde CreatureDisplayInfo con TextureVariation1, 2 y 3, sin extensión y relativas a la carpeta del modelo. Así un mismo M2 sirve para varios colores.
# 4. Tablas DBC del cliente
Las edita AWE (Model wizard) o cualquier editor de DBC. El M2 se llama por la ruta de CreatureModelData; las rutas de DBC llevan `.mdx` aunque el archivo sea `.m2` (el cliente lo traduce).
## 4.1 CreatureModelData
Una fila por modelo. Campos que importan:
| Campo | Valor
| ID | Un ID libre (usa Free ids en AWE, o busca el máximo)
| ModelName | `Creature\MiMontura\MiMontura.mdx`
| ModelScale | 1.0 al principio; ajusta después si sale grande o pequeño
| CollisionWidth, CollisionHeight | Caja de colisión; copia la de un modelo parecido
| MountHeight | Altura a la que se sienta el jinete: solo importa en monturas; copia el de una montura del mismo tamaño
| GeoBox (6 valores) | Caja del modelo; copia de un parecido o saca la del M2
| SizeClass, BloodID, FootprintTextureID | Cópialos de un parecido; 0 si dudas
## 4.2 CreatureDisplayInfo
Una fila por aspecto. ModelID apunta a la fila de CreatureModelData, TextureVariation1-3 es el nombre de la textura (sin extensión), ExtendedDisplayInfoID es 0 salvo en humanoides y CreatureModelScale es el tamaño final (1 = el de CreatureModelData). Un modelo con tres colores son tres filas de DisplayInfo y una de ModelData.
## 4.3 CreatureDisplayInfoExtra (solo humanoides)
Solo si el modelo es un personaje con raza (un NPC humanoide con piel, cara y equipo). Cada fila define raza, sexo, piel, cara, pelo, vello facial y qué objeto lleva en cada ranura. Pon su ID en ExtendedDisplayInfoID de la fila de CreatureDisplayInfo. Para monturas, mascotas y monstruos va a 0 y no se crea.
# 5. Base de datos del servidor
## 5.1 Criatura
- `creature_template`: la entrada (ID libre). Para una montura basta un registro mínimo: nombre, nivel, `faction` 35, `npcflag` 0. Para una mascota de compañía pon `type` 12 (no combatiente) y `faction` 35.
- `creature_template_model`: columnas `CreatureID`, `Idx`, `CreatureDisplayID`, `DisplayScale`, `Probability`. Una fila por aspecto (Idx 0, 1, 2...) con el ID de CreatureDisplayInfo de la sección 4.
- `creature_model_info`: una fila por DisplayID con `BoundingRadius`, `CombatReach` y `Gender` (2 = sin sexo). Si falta, el servidor usa valores por defecto y la caja o el alcance salen mal.
- NPC con equipo: añade `creature_equip_template`. NPC en el mundo: un spawn en `creature` (guía 7).
## 5.2 Hechizo de montura
Se hace en `spell_dbc` (CoA) y en Spell.dbc. Lo más seguro es copiar un hechizo de montura existente del mismo tipo y cambiar solo estos campos:
| Campo | Valor
| Effect1 | 6 (SPELL_EFFECT_APPLY_AURA)
| EffectAura1 | 78 (SPELL_AURA_MOUNTED)
| EffectMiscValue1 | La entrada de creature_template de la montura
| Effect2 / EffectAura2 | 6 / 32 (MOD_INCREASE_MOUNTED_SPEED): velocidad en suelo; EffectBasePoints es el porcentaje menos uno (59 = +60 %)
| Effect3 / EffectAura3 | 6 / 207: velocidad de vuelo si la montura vuela
| Atributos, ShapeshiftMask, AuraInterruptFlags | Los del hechizo que copiaste (se desmonta al recibir daño, al cambiar de forma, etc.)
La velocidad base la decide el porcentaje de la aura 32 (o 207): 59 para +60 %, 99 para +100 %, 149 para +150 %.
## 5.3 Hechizo de mascota de compañía
Copia un hechizo de compañía existente (el que enseña una mascota de las del juego). El esquema es: efecto de invocación (SPELL_EFFECT_SUMMON, 28), EffectMiscValue con la entrada de la criatura y EffectMiscValueB con las propiedades de invocación de compañía (SummonProperties; copia el valor del hechizo original, normalmente 64). El resto (rango, duración 0, atributos) también se copia.
## 5.4 El objeto
En `item_template` copia un objeto de montura o de mascota existente y cambia nombre, `displayid` e icono. El patrón de aprender es:
| Campo | Valor
| class / subclass | 15 / 5 para monturas, 15 / 2 para mascotas de compañía
| spellid_1 / spelltrigger_1 | 483 (el hechizo de aprender) / 0 (al usar)
| spellid_2 / spelltrigger_2 | El hechizo de montura o de mascota / 6 (aprender hechizo)
| spellcharges_1 | -1 (se consume al usar)
| bonding | 1 si debe ligarse al recoger
Por la forma en que el cliente lo lee, el objeto necesita además una fila en Item.dbc (o en la tabla `item_dbc` de CoA) con su ID, clase, subclase, DisplayInfoID e InventoryType. Sin esa fila el objeto sale con un icono "?". En CoA también hay que registrar el ID en el parche de objetos del cliente (`ClientItemPatches`).
# 6. Parche del cliente (MPQ)
Todo lo que el cliente necesita va en un MPQ en la carpeta `Data` con nombre `patch-X.MPQ` (una letra o un número; el cliente carga los parches por orden y el último gana). Las rutas dentro del MPQ son las mismas que las del juego:
| Ruta en el MPQ | Qué es
| `Creature\MiMontura\MiMontura.m2` | El modelo (versión 264)
| `Creature\MiMontura\MiMontura00.skin` | La skin (y las demás: `01`, `02`...)
| `Creature\MiMontura\MiMonturaBase.blp` | Las texturas
| `DBFilesClient\CreatureModelData.dbc` | La tabla con tu fila
| `DBFilesClient\CreatureDisplayInfo.dbc` | La tabla con tus filas
| `DBFilesClient\Spell.dbc` | Solo si el hechizo no llega por el parche de CoA
| `DBFilesClient\Item.dbc` | Idem para el objeto
Al cambiar el MPQ, cierra el juego y borra la carpeta `Cache` (o `Cache\WDB`): el cliente guarda en ella los datos de criaturas y objetos y si no la borras sigue viendo la versión vieja. Copia también los DBC modificados a la carpeta `dbc` del servidor, para que servidor y cliente coincidan.
# 7. El asistente de AWE: CoA content > Model wizard
Este asistente junta los pasos 4, 5 y 6 en uno. Necesitas la Server data folder y la Game client folder configuradas (guía 1). Los nombres exactos de los campos pueden variar entre versiones; el orden es siempre el mismo.
1. En la barra superior abre **CoA content** y elige **Model wizard**.
2. Elige el tipo de resultado: **Montura**, **Mascota de compañía** o **NPC**. El asistente pone solo los campos que ese tipo necesita.
3. Pulsa el selector del modelo y escoge el `.m2` bajado a 264. AWE comprueba la versión, localiza los `.skin` y lista las texturas que el M2 pide. Si algo falta o la versión no es 264, te lo dice aquí y no te deja seguir.
4. Elige las texturas BLP de cada ranura. Si el modelo tiene varios colores, añade un aspecto por color.
5. Pon el nombre y deja que el asistente reserve los IDs libres: el de la criatura, el de CreatureModelData, el de CreatureDisplayInfo y, si hace falta, los del hechizo y el objeto. Puedes cambiarlos a mano.
6. Ajusta la escala y, en una montura, la altura del jinete y las velocidades (suelo y vuelo). La vista previa en 3D te enseña el modelo con esos valores.
7. Si es un NPC humanoide, rellena raza, sexo y equipo para crear la fila de CreatureDisplayInfoExtra.
8. Revisa el resumen: te enseña las filas de base de datos (creature_template, creature_template_model, creature_model_info, spell_dbc, item_template) y las filas de DBC que va a escribir.
9. Pulsa generar. El asistente añade las filas al proyecto, escribe el SQL con el resto de cambios y deja una carpeta con los archivos del parche listos para empaquetar en el MPQ (`Creature\...` y `DBFilesClient\...`).
10. Empaqueta esa carpeta en `patch-X.MPQ` con un editor de MPQ, copia el MPQ a `Data`, borra `Cache`, aplica el SQL, reinicia el worldserver y prueba (sección 10).
Todo lo que el asistente genera entra en el proyecto como cualquier otro cambio: se puede deshacer (Ctrl+Z) y se exporta con Export (guía 10).
# 8. Límites
## 8.1 Legalidad
- Los modelos y texturas de retail pertenecen a Blizzard Entertainment. Úsalos solo en privado, para tu propio servidor de pruebas.
- No los redistribuyas nunca: ni en un parche para jugadores, ni en un repositorio público ni en una PR. Sube al repositorio solo el SQL y las filas de base de datos, no los M2, BLP ni el MPQ.
- Si quieres compartir, usa modelos propios o con licencia que lo permita. Esta guía describe herramientas generales y no enlaza descargas.
## 8.2 Huesos y animaciones
- El juego pide animaciones por ID. Las básicas: 0 (Stand), 4 (Walk), 5 (Run), 37-39 (salto: inicio, en el aire, aterrizaje). Si falta una, el modelo se queda quieto o en pose T al hacerla.
- Una montura voladora necesita además sus animaciones de vuelo (quieto y avance). Copia los IDs de una montura voladora convertida con la misma herramienta.
- El jinete se sienta en un punto de anclaje del modelo (attachment) y toma la animación de montado. Sin ese anclaje el jinete queda en el suelo o en el centro del modelo. La altura se ajusta con MountHeight (sección 4.1).
- Modelos de retail de huesos muy modernos pueden perder animaciones al bajarlos: revisa el resultado en Blender o en el visor de AWE antes de empaquetar.
## 8.3 Polígonos y texturas
- Objetivo: menos de 10.000 triángulos por modelo. Las monturas se ven a menudo en grupo.
- Texturas: potencia de dos, máximo 1024 por lado, DXT1 o DXT5. Una textura de 2048 o no potencia de dos se ve en blanco o hace caer los fotogramas.
- Cada textura y material extra es una llamada de dibujo más. Junta texturas en un atlas si puedes.
# 9. Problemas frecuentes
| Síntoma | Causa y solución
| Modelo invisible | La ruta de ModelName no coincide con la del MPQ, falta el `.skin`, o el MPQ no se carga (el nombre debe ser `patch-X.MPQ` y estar en `Data`). Borra `Cache`
| Textura verde, negra o blanca | El BLP no es BLP2, no es potencia de dos, es mayor de 1024 o la ruta/TextureVariation no coincide con el nombre del archivo
| El cliente se cierra al ver el modelo | El M2 no es versión 264, o el `.skin` no corresponde a ese M2
| Aparece otro modelo | Otra fila usa el mismo ID de DisplayInfo, o el cliente guarda el valor viejo en `Cache`
| Te montas pero no ves la montura | EffectMiscValue del hechizo no es la entrada de la criatura, o falta creature_template_model
| Montura demasiado grande o pequeña | Ajusta ModelScale, CreatureModelScale y DisplayScale; la altura del jinete es MountHeight
| La mascota no sale | Falta `type` 12 o la propiedad de invocación del hechizo no es la de compañía; copia un hechizo de compañía real
| El objeto sale con icono "?" | Falta la fila en Item.dbc / `item_dbc` o el registro del cliente
| Los cambios no se aplican | Tras cambiar el SQL hay que reiniciar el worldserver y, si cambiaste DBC, copiarlos también a la carpeta `dbc` del servidor
# 10. Cómo probarlo en el juego
1. Aplica el SQL a tu base de pruebas, copia los DBC al servidor y reinicia el worldserver.
2. Copia el `patch-X.MPQ` a `Data`, borra `Cache` y entra.
3. Consigue el objeto con el comando de GM `.additem` y úsalo; o aprende el hechizo con `.learn` y lanza la montura o la mascota.
4. Comprueba: se ve el modelo, la textura es correcta, el jinete queda sentado a la altura buena, la montura anda, corre, salta y (si vuela) vuela y se para.
5. Prueba el desmontaje, y prueba también tras relogear (el hechizo aprendido debe seguir en el libro).
