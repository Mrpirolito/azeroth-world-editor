# Guía: crear assets de armadura para CoA (cliente 3.3.5a / Ascension)

Esta guía explica cómo se construye una armadura en el cliente de WotLK 3.3.5a (el que usa CoA), qué
ficheros hay que crear, con qué herramientas, y cómo llegan al juego. Al final se explica cómo encaja con
la pestaña **Tier Sets** de AWE.

---

## 1. Cómo dibuja el cliente una armadura

Una pieza de armadura **no es un único modelo 3D**. Según el hueco, el cliente usa una o varias de estas
tres cosas:

| Tipo | Qué es | Piezas que lo usan |
|---|---|---|
| **Texturas de cuerpo** (texture components) | Imágenes que el cliente "pinta" encima de la piel del personaje, por regiones del cuerpo | Pecho, camisa, tabardo, guantes, cinturón, piernas, botas, muñecas (y la parte de torso de la túnica) |
| **Geosets** | Trozos de malla que ya existen en el modelo de cada raza y se encienden/apagan (mangas largas, faldón de túnica, botas altas, guantes con puño...) | Pecho, guantes, botas, piernas, capa |
| **Modelos M2 propios** | Modelos 3D sueltos que se pegan a un punto del cuerpo | Casco, hombreras (izquierda y derecha), y la textura de la capa |

Todo lo que define el aspecto de un item está en **una fila de `ItemDisplayInfo.dbc`** del cliente. El
item del servidor (`item_template.displayid`) solo apunta a esa fila.

### 1.1 Columnas de `ItemDisplayInfo.dbc` que importan

| Campo | Para qué |
|---|---|
| `ID` | El displayid. Es lo que pones en `item_template.displayid` e `item_dbc.DisplayInfoID`. |
| `ModelName[0]`, `ModelName[1]` | Nombre del `.m2` (casco, hombrera izquierda / derecha). Vacío para piezas solo de textura. |
| `ModelTexture[0]`, `ModelTexture[1]` | Textura (`.blp`) que se aplica a esos modelos. |
| `InventoryIcon[0]` | Icono de la bolsa (`Interface\Icons\<nombre>.blp`). |
| `GeosetGroup[0..2]` | Qué variante de geoset se enciende (mangas, faldón, botas altas...). |
| `HelmetGeosetVis[0..1]` | Qué partes de la cabeza esconde el casco (pelo, orejas, barba) por sexo. |
| `Texture[0..7]` | Las 8 texturas de cuerpo, una por región (ver 1.2). |
| `ItemVisual` | Efecto/glow (`ItemVisuals.dbc`), opcional. |
| `SpellVisualID`, `GroupSoundIndex`, `ParticleColorID`, `Flags` | Normalmente se copian de una armadura parecida. |

### 1.2 Regiones de textura de cuerpo

`Texture[i]` es solo el **nombre base**; el cliente busca el fichero en la carpeta de su región y le
añade el sufijo de sexo (`_M` masculino, `_F` femenino, `_U` unisex).

| Índice | Región | Carpeta en el MPQ | Tamaño |
|---|---|---|---|
| 0 | Brazo superior | `Item\TextureComponents\ArmUpperTexture\` | 256×128 |
| 1 | Brazo inferior | `Item\TextureComponents\ArmLowerTexture\` | 256×128 |
| 2 | Mano | `Item\TextureComponents\HandTexture\` | 256×64 |
| 3 | Torso superior | `Item\TextureComponents\TorsoUpperTexture\` | 256×128 |
| 4 | Torso inferior | `Item\TextureComponents\TorsoLowerTexture\` | 256×64 |
| 5 | Pierna superior | `Item\TextureComponents\LegUpperTexture\` | 256×128 |
| 6 | Pierna inferior | `Item\TextureComponents\LegLowerTexture\` | 256×128 |
| 7 | Pie | `Item\TextureComponents\FootTexture\` | 256×64 |

Ejemplo: `Texture[3] = "Plate_CoATier1_Chest_TU"` → el cliente carga
`Item\TextureComponents\TorsoUpperTexture\Plate_CoATier1_Chest_TU_M.blp` (o `_F`, o `_U` si no hay
de sexo).

> Consejo: lo más fácil para empezar es **copiar las texturas de una armadura parecida**, abrirlas y
> repintarlas. Así respetas exactamente dónde cae cada costura del cuerpo.

### 1.3 Modelos de casco y hombreras

| Pieza | Carpeta | Ficheros |
|---|---|---|
| Casco | `Item\ObjectComponents\Head\` | Un `.m2` **por raza y sexo**: `Helm_X_HuM.m2`, `Helm_X_HuF.m2`, `Helm_X_OrM.m2`... (Hu=humano, Or=orco, Dw=enano, NI=elfo de la noche, Sc=no-muerto, Ta=tauren, Gn=gnomo, Tr=trol, BE=elfo de sangre, Dr=draenei). En `ModelName` se pone sin sufijo de raza: `Helm_X.m2`. |
| Hombreras | `Item\ObjectComponents\Shoulder\` | `LShoulder_X.m2` y `RShoulder_X.m2` (un modelo por lado, sirve para todas las razas). |
| Capa | `Item\ObjectComponents\Cape\` | Solo textura: `Cape_X.blp` (256×256). La forma de la capa es un geoset del personaje. |

Junto al `.m2` van su(s) `.skin` (`Helm_X_HuM00.skin`), que es la malla optimizada que genera el
exportador, y las texturas `.blp` del modelo.

---

## 2. Herramientas

| Para | Herramienta | Notas |
|---|---|---|
| Ver modelos y texturas del cliente | **WoW Model Viewer 0.7.x** (versión para 3.3.5) | Abre la carpeta del cliente de CoA; sirve para buscar armaduras de referencia y probar combinaciones. |
| Extraer ficheros del cliente | **Ladik's MPQ Editor** | Abre los `patch-*.MPQ` y `common.MPQ`; extrae las texturas/modelos de referencia. |
| Convertir texturas | **BLP Lab** o **BLPConverter** | PNG/TGA ⇄ BLP. Usa **BLP2, DXT1** para texturas sin transparencia y **DXT5 o DXT3** si tienen alfa (capas con agujeros, gemas brillantes). Genera mipmaps. |
| Pintar texturas | Photoshop, GIMP, Krita | Trabaja a 2× o 4× del tamaño final y reduce al exportar. Respeta tamaños potencia de 2. |
| Modelar cascos/hombreras | **Blender** + addon de exportación M2 para WotLK (p. ej. *WoW Blender Studio* con perfil 3.3.5, o importar/exportar con *M2Mod* / *WMV export*) | Lo más seguro: importar un casco/hombrera existente, modificarlo, y exportarlo con los mismos huesos y attachments. |
| Editar DBC | **AWE** (editor DBC y pestaña Tier Sets) | AWE crea la fila de `ItemDisplayInfo` y empaqueta el parche. |
| Empaquetar | **AWE → Export client patch** (o MPQ Editor a mano) | Genera `patch-CZZZ.MPQ` con DBC + texturas + modelos. |

---

## 3. Flujo paso a paso: armadura nueva solo con texturas (lo más común)

Vale para pecho, guantes, cinturón, piernas, botas y muñecas.

1. **Elige una base.** En WoW Model Viewer busca una armadura con la forma que quieres (mangas largas,
   faldón, botas altas). Apunta su displayid.
2. **Extrae sus texturas.** Con MPQ Editor saca los `.blp` de cada región que use (mira su fila en
   `ItemDisplayInfo` desde AWE: columnas `Texture[0..7]`).
3. **Conviértelas a PNG** con BLP Lab y **repíntalas**. No muevas las costuras ni cambies el tamaño.
4. **Nombra tus ficheros** con un prefijo propio para no pisar nada:
   `CoA_<Set>_<Pieza>_<Región>_<Sexo>.blp`, por ejemplo `CoA_T1Warrior_Chest_TU_M.blp`.
   Si la textura vale igual para los dos sexos, usa `_U`.
5. **Convierte a BLP** (DXT1, mipmaps) y colócalos en la carpeta de su región (tabla 1.2).
6. **Crea la fila de `ItemDisplayInfo`** (AWE lo hace por ti en la pestaña Tier Sets): copia la fila de la
   base, pon un `ID` libre y cambia `Texture[i]` a tus nombres base (sin `_M/_F/_U`) y el icono.
7. **Icono.** 64×64, BLP, en `Interface\Icons\`. Puedes reutilizar uno existente.
8. **Empaqueta** el parche (DBC + BLP) y prueba en el cliente (sección 6).

## 4. Flujo paso a paso: casco u hombreras nuevos (modelo 3D)

1. **Parte de un modelo existente.** Extrae un casco/hombrera parecido (`.m2` + `.skin` + `.blp`).
2. **Impórtalo en Blender** con el addon M2. Comprueba que trae los **attachments** (punto de unión a la
   cabeza / hombro) y que la escala es correcta.
3. **Modela encima**: modifica la malla, añade piezas, rehaz el UV si hace falta.
   - Mantén pocos polígonos (cascos de WotLK: ~500-1.500 triángulos).
   - Un material por textura; texturas 256×256 o 512×512.
4. **Texturiza**: pinta la textura, exporta a BLP (DXT1, o DXT5 si hay transparencias).
5. **Exporta a M2 (versión WotLK, 264)** con su `.skin`.
6. **Cascos: un fichero por raza/sexo.** Lo normal es exportar la misma malla ajustada a cada cabeza
   (las cabezas cambian mucho entre razas). Si solo haces una, cópiala con los 20 sufijos para que
   ninguna raza salga sin casco, y revisa cómo queda.
7. **Configura `HelmetGeosetVis`** para esconder pelo/orejas que atraviesen el casco.
8. **Crea la fila de `ItemDisplayInfo`** con `ModelName[0]` (y `[1]` para la otra hombrera),
   `ModelTexture[0..1]` e icono.
9. **Empaqueta y prueba.**

## 5. Reglas para no romper nada

- **IDs:** usa un rango propio para displayids (AWE lo reserva con `dbc_free_id`). Nunca reutilices un
  displayid existente: cambiaría el aspecto de otros items del juego.
- **Nombres de fichero:** siempre con prefijo `CoA_` y sin espacios. Un nombre repetido pisa el fichero
  original del cliente.
- **Rutas:** dentro del MPQ, con barras invertidas y respetando mayúsculas como las del cliente.
- **Tamaños:** potencias de 2 y exactamente los de la tabla 1.2 para texturas de cuerpo.
- **Formato:** BLP2 con mipmaps. PNG/TGA no los lee el cliente.
- **Servidor:** el item necesita `item_template.displayid` = tu ID, su fila `item_dbc` con el mismo
  `DisplayInfoID`, y estar registrado en `ClientItemPatches` para que el icono no salga como "?".
- **Parche de cliente obligatorio:** sin el MPQ, los jugadores ven el item invisible o con el aspecto
  por defecto. El parche se distribuye con el launcher de CoA.

## 6. Probar

1. Copia el `patch-CZZZ.MPQ` generado a `Data\` del cliente de pruebas (borra `Cache\` del cliente).
2. Arranca tu servidor local con el SQL del set aplicado.
3. `.additem <id>` y equípalo con varias razas y los dos sexos.
4. Revisa: costuras de texturas, mangas/faldón, casco con pelo/orejas, hombreras en ambos lados, icono.
5. Ajusta, vuelve a exportar el parche y repite.

## 7. Cómo lo usará la pestaña Tier Sets de AWE

Por cada pieza podrás elegir entre:

- **Usar un aspecto existente:** buscador de displayids del cliente con vista 3D (no hace falta ningún
  asset nuevo).
- **Aspecto nuevo:**
  - *Texturas:* arrastras tus PNG/BLP a cada región del cuerpo; AWE comprueba tamaño, las convierte a
    BLP, les pone el nombre con prefijo y crea la fila de `ItemDisplayInfo` partiendo de la base elegida.
  - *Modelos:* arrastras el `.m2` (+ `.skin` + `.blp`) del casco o las hombreras; AWE los coloca en su
    carpeta y crea la fila.
- **Vista previa 3D** del set completo puesto en el personaje (raza y sexo a elegir).
- Al exportar, AWE genera a la vez la **PR del servidor** (items, set, bonus, tokens, vendedor) y el
  **parche de cliente** con DBC, texturas y modelos.
