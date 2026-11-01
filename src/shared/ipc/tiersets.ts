import type { ParsedBonus } from '@core/tiersets/bonus-text';
import type { SetIssue } from '@core/tiersets/rows';
import type { TierSet, PieceKey } from '@core/tiersets/model';
import type { FileTarget } from '@core/tiersets/files';
import type { Result } from './result';

export type { TierSet, PieceKey, FileTarget, SetIssue, ParsedBonus };

/** A look a piece can use: an `ItemDisplayInfo` id and what wears it */
export interface TierLook {
  displayId: number;
  /** The name of one item that uses it */
  name: string;
  /** How many items use it */
  items: number;
}

/** Tier sets: five armor pieces of one class, saved into the project as items, client rows, an item set and client files */
export interface TierSetsApi {
  /** The tier sets the project holds */
  tierSets(): Promise<Result<TierSet[]>>;
  /** Saves a set as one undo step: gives its pieces item ids, its set an ItemSet id and its new looks display ids (kept on later saves), and writes their items, rows and DBC records into the project */
  tierSetSave(set: TierSet): Promise<Result<{ set: TierSet; issues: SetIssue[]; warnings: string[] }>>;
  /** Takes a saved set out of the project, with everything its save made */
  tierSetDelete(name: string): Promise<Result<true>>;
  /** Stores a texture or model file for a piece of a saved set (a PNG is converted to BLP and its size checked); `data` is the file in base64 */
  tierSetFile(name: string, piece: PieceKey, target: FileTarget, data: string): Promise<Result<{ paths: string[] }>>;
  /** Looks of the client that fit a piece's slot, found by display id or by the name of an item that uses it, most used first */
  tierSetLooks(piece: PieceKey, text: string): Promise<Result<{ looks: TierLook[] }>>;
  /** Reads bonus wording into a template draft (rule-based; what it cannot map becomes a pending bonus) with the spell names found in Spell.dbc; nothing is saved */
  tierSetBonusDraft(text: string): Promise<Result<ParsedBonus>>;
}
