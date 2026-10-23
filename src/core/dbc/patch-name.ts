import { archiveOrder } from '../client/client-files';

/** The client patch archive's default name: it loads after every `patch-C…` the Ascension and CoA clients ship up to `patch-CZZ` */
export const DEFAULT_PATCH_NAME = 'patch-CZZZ.MPQ';
/** The last patch the clients ship, which the editor's must follow */
export const LAST_SHIPPED_PATCH = 'patch-CZZ.MPQ';

/** Why a name cannot be the client patch's, or null when it can */
export function patchNameIssue(name: string): string | null {
  if (!/^patch-[A-Za-z0-9]{1,16}\.mpq$/i.test(name)) return 'The name must look like patch-CZZZ.MPQ: "patch-", letters or digits, ".MPQ".';
  if (name.toLowerCase() === LAST_SHIPPED_PATCH.toLowerCase()) return `${LAST_SHIPPED_PATCH} is the client's own patch; the editor's must come after it.`;
  const order = archiveOrder([LAST_SHIPPED_PATCH, name], 'enUS');
  if (order.at(-1) !== name) return `The client loads ${name} before ${LAST_SHIPPED_PATCH}, so the stock patches would win; pick a name that sorts after it (patch-CZZZ.MPQ).`;
  return null;
}
