import { describe, expect, it } from 'vitest';
import { DEFAULT_PATCH_NAME, patchNameIssue } from '../../src/core/dbc/patch-name';

describe('the client patch name', () => {
  it('defaults to a name that loads after patch-CZZ', () => {
    expect(patchNameIssue(DEFAULT_PATCH_NAME)).toBeNull();
    expect(patchNameIssue('patch-DAA.mpq')).toBeNull();
  });
  it('refuses names that load too early or are not patch names', () => {
    expect(patchNameIssue('patch-CZZ.MPQ')).toMatch(/client's own/);
    expect(patchNameIssue('patch-CZ.MPQ')).toMatch(/before patch-CZZ/);
    expect(patchNameIssue('patch-3.MPQ')).toMatch(/before patch-CZZ/);
    expect(patchNameIssue('custom.MPQ')).toMatch(/must look like/);
    expect(patchNameIssue('patch-C ZZ.MPQ')).toMatch(/must look like/);
  });
});
