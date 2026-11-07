import type { SetIssue } from '@core/tiersets/rows';
import type { WizardDraft, WizardFile } from '@core/modelwizard/model';
import type { Result } from './result';

export type { WizardDraft, WizardFile };

/** What the wizard made (or would make) for a draft */
export interface WizardResult {
  /** `spell` and `item` are 0 for an NPC */
  ids: { modelData: number; display: number; creature: number; spell: number; item: number };
  /** Client records the project now carries (or would) */
  records: { file: string; id: number }[];
  /** Archive paths of the client files */
  paths: string[];
  issues: SetIssue[];
  warnings: string[];
  saved: boolean;
}

/** The custom model wizard: a mount, companion pet or NPC made from an M2 model */
export interface ModelWizardApi {
  /** Settles the ids and checks the files; with `save` it also writes the records, creature, item and files into the project as one undo step (refused while an issue is an error) */
  modelWizard(draft: WizardDraft, files: WizardFile[], save: boolean): Promise<Result<WizardResult>>;
}
