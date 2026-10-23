/**
 * When a creature's or object's SmartAI rows may be edited, and where an existing one keeps the rows it
 * had when it was brought into the project.
 */

/** The key of `origin.original` holding every `smart_scripts` row of the entity as the database had it */
export const SMART_ROWS_KEY = 'smart_scripts_owner';

type Template = { AIName?: string | null; ScriptName?: string | null } | undefined;

/** The AI name that runs SmartAI rows for each kind of owner */
export const SMART_AI_NAME = { npc: 'SmartAI', object: 'SmartGameObjectAI' } as const;

/**
 * Whether the owner runs something else (another AI or a C++ script), so SmartAI rows on it would never
 * run and are not ours to write. An owner with no template row is not locked.
 */
export function smartLocked(kind: 'npc' | 'object', template: Template): boolean {
  if (!template) return false;
  const ai = template.AIName ?? '';
  return (ai !== '' && ai !== SMART_AI_NAME[kind]) || (template.ScriptName ?? '') !== '';
}

/** Whether an existing entity was brought into the project before its SmartAI rows were read: they are then not ours to write */
export function smartUnread(origin: { kind: string; original?: Record<string, unknown> }): boolean {
  return origin.kind === 'existing' && !Object.prototype.hasOwnProperty.call(origin.original ?? {}, SMART_ROWS_KEY);
}
