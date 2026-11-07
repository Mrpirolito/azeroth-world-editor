/**
 * The number for the next export on `date`: one past the highest `rev_<date>_<nn>_…` already in the folder
 * (a patch's revert file counts too) and one past the last this session wrote, starting at 01. The number
 * is shared by every kind of export, as the updates of one day are numbered together. Counting the files
 * instead sent a new export to an old name as soon as an earlier one was moved out of the folder,
 * overwriting what was left.
 */
export function nextExportSequence(existing: readonly string[], date: string, writtenBefore = 0): number {
  const own = new RegExp(`^rev_${date}_(\\d+)_`);
  const onDisk = existing.reduce((highest, name) => {
    const found = own.exec(name);
    return found ? Math.max(highest, Number(found[1])) : highest;
  }, 0);
  return Math.max(onDisk, writtenBefore) + 1;
}
