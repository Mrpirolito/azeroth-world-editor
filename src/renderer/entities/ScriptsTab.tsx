import type { CustomNpc } from '@core/entities/model';
import { NPC_SCENE_LIMIT, blankNpcScene, nextNpcSceneId, scenesLocked, type NpcScene } from '@core/scripts/npc-scenes';
import { fightIsEmpty } from '@core/combat/model';
import { SMART_ROWS_KEY, smartUnread } from '@core/smartai/lock';
import type { SmartRow } from '@core/smartai/row';
import { SmartScriptsPanel } from '../smartai/SmartScriptsPanel';
import { NpcSceneCard } from './NpcSceneCard';

/** The Scripts tab's body: the scenes the NPC owns, whatever the quest */
export function ScriptsTab({
  npc, onChange, onTab, quests = [],
}: {
  npc: CustomNpc;
  onChange(next: CustomNpc): void;
  onTab?(id: string): void;
  /** The project's quests a scene can be about */
  quests?: readonly { questId: number; title: string }[];
}): React.JSX.Element {
  const scenes = npc.scenes;
  // The lock is a snapshot: an NPC adopted before it was recorded is judged by the template it was read with
  const locked = npc.origin.kind === 'existing' && (npc.origin.locked.includes('scenes') || scenesLocked(npc.origin.original.creature_template?.[0]));
  const databaseScripts = npc.origin.kind === 'existing' ? (npc.origin.databaseScripts ?? 0) : 0;
  const setScenes = (next: NpcScene[]): void => onChange({ ...npc, scenes: next });
  const full = scenes.length >= NPC_SCENE_LIMIT;
  const name = npc.name.trim() || `NPC ${npc.entry}`;
  // The SmartAI rows the database had when it was brought in; a new NPC has none
  const original = npc.origin.kind === 'existing' ? (npc.origin.original[SMART_ROWS_KEY] as SmartRow[] | undefined) : undefined;
  const blockedReason = locked
    ? 'Its AI is not SmartAI, so SmartAI rows would never run on it.'
    : smartUnread(npc.origin)
      ? 'This NPC was brought into the project before its SmartAI rows were read. Choose Put back as the database has it, then edit it again.'
      : scenes.length > 0
        ? 'This NPC has scenes, which write SmartAI rows of their own. Remove them first to edit the rows directly.'
        : npc.fight && !fightIsEmpty(npc.fight)
          ? 'This NPC has a fight, which writes SmartAI rows of its own. Clear it first to edit the rows directly.'
          : undefined;
  const rowsPanel = (
    <SmartScriptsPanel owner={{ kind: 'creature', entry: npc.entry, name }} rows={npc.smartScripts} original={original} unread={smartUnread(npc.origin)}
      blockedReason={npc.smartScripts === null ? blockedReason : undefined} onChange={(smartScripts) => onChange({ ...npc, smartScripts })} />
  );
  // Rows edited directly hold every row of the NPC, so scenes have nothing to add to them
  if (npc.smartScripts !== null) return rowsPanel;

  return (
    <>
      {locked && <p className="scene-hint">This NPC runs another AI or a script, so scenes are not written for it.</p>}
      {databaseScripts > 0 && (
        <p className="scene-hint">
          The database already runs {databaseScripts} {databaseScripts === 1 ? 'script' : 'scripts'} on this NPC; they are not edited here.
        </p>
      )}
      {scenes.length === 0 && <p className="scene-hint">This NPC has no scenes. A scene says what it does when something happens to it.</p>}
      {scenes.map((scene, i) => (
        <NpcSceneCard
          key={scene.id}
          npc={npc}
          scene={scene}
          scenes={scenes}
          quests={quests}
          readOnly={locked}
          onTab={onTab}
          onChange={(next) => setScenes(scenes.map((s, j) => (j === i ? next : s)))}
          onRemove={() => setScenes(scenes.filter((_, j) => j !== i))}
          onDuplicate={() => {
            if (full) return;
            const copy: NpcScene = { ...structuredClone(scene), id: nextNpcSceneId(scenes), name: `${scene.name.trim() || 'Scene'} (copy)` };
            setScenes([...scenes.slice(0, i + 1), copy, ...scenes.slice(i + 1)]);
          }}
        />
      ))}
      <button type="button" className="btn" disabled={locked || full} onClick={() => setScenes([...scenes, blankNpcScene(nextNpcSceneId(scenes))])}>
        Add scene
      </button>
      {full && <p className="scene-hint">An NPC can have {NPC_SCENE_LIMIT} scenes.</p>}
      {rowsPanel}
    </>
  );
}
