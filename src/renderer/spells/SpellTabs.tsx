import { useId, useMemo, useState } from 'react';
import type { DbcValue } from '@core/game/dbc-file';
import { SPELL_FIELDS } from '@core/game/dbc-formats';
import {
  ATTRIBUTE_WORDS, AURA_EFFECTS, AURA_INTERRUPT_BITS, AURAS, CAST_INTERRUPT_BITS, DISPEL_TYPES, EFFECTS, MECHANICS, POWER_TYPES, SCHOOL_BITS, TARGETS,
} from '@core/spells/catalogue';
import { castSentence, effectSentence, type DescribeContext } from '@core/spells/describe';
import { castTimeLabel, durationLabel, radiusLabel, rangeLabel, timeLabel, type SpellLookups } from '@core/spells/lookups';
import { effectOf, effectRange, pointsFor, spellNum, spellText, withEffect } from '@core/spells/model';
import { SpellField } from '../combat/SpellField';
import { TextField } from '../scripts/fields';
import { IconPicker, Mask, Num, Pick, TablePick } from './fields';

export interface TabProps {
  record: DbcValue[];
  /** Changes fields by name */
  change(changes: Record<string, DbcValue>): void;
  /** Puts a whole new record (used by the effect cards, which write several fields) */
  replace(next: DbcValue[]): void;
  lookups: SpellLookups;
  describe: DescribeContext;
  disabled: boolean;
}

const ids = (m: ReadonlyMap<number, unknown>): number[] => [...m.keys()];

export function BasicsTab({ record, change, lookups, describe, disabled }: TabProps): React.JSX.Element {
  const n = (name: string): number => spellNum(record, name);
  return (
    <div className="spell-tab">
      <p className="scene-hint" aria-label="How it is cast">{castSentence(record, describe)}</p>
      <fieldset className="sheet-group" aria-label="Names">
        <legend className="scene-section__title">Names</legend>
        <div className="sheet-grid">
          <TextField label="Name" value={spellText(record, 'Name')} onChange={(Name) => change({ Name })} />
          <TextField label="Rank" value={spellText(record, 'Rank')} onChange={(Rank) => change({ Rank })} />
        </div>
        <TextField label="Description (spellbook tooltip)" value={spellText(record, 'Description')} long onChange={(Description) => change({ Description })} />
        <TextField label="Tooltip while active (buff tooltip)" value={spellText(record, 'ToolTip')} long onChange={(ToolTip) => change({ ToolTip })} />
        <small className="scene-hint">Text can use $s1 for effect 1&apos;s value, $d for the duration and $a1 for its radius.</small>
      </fieldset>
      <fieldset className="sheet-group" aria-label="Icon">
        <legend className="scene-section__title">Icon</legend>
        <IconPicker value={n('SpellIconID')} lookups={lookups} disabled={disabled} onChange={(SpellIconID) => change({ SpellIconID })} />
      </fieldset>
      <fieldset className="sheet-group" aria-label="School and cost">
        <legend className="scene-section__title">School and cost</legend>
        <Mask label="School" bits={SCHOOL_BITS} value={n('SchoolMask')} disabled={disabled} onChange={(SchoolMask) => change({ SchoolMask })} />
        <div className="sheet-grid">
          <Pick label="Costs" value={n('PowerType')} options={POWER_TYPES} disabled={disabled} onChange={(PowerType) => change({ PowerType })} />
          <Num label="Cost" value={n('ManaCost')} min={0} disabled={disabled} onChange={(ManaCost) => change({ ManaCost })} />
          <Num label="Cost (% of base)" value={n('ManaCostPercentage')} min={0} disabled={disabled} onChange={(ManaCostPercentage) => change({ ManaCostPercentage })} hint="Used instead of the plain cost when above 0." />
          <Num label="Cost per second (channels)" value={n('ManaPerSecond')} min={0} disabled={disabled} onChange={(ManaPerSecond) => change({ ManaPerSecond })} />
        </div>
      </fieldset>
      <fieldset className="sheet-group" aria-label="Levels">
        <legend className="scene-section__title">Levels</legend>
        <div className="sheet-grid">
          <Num label="Learned at level" value={n('SpellLevel')} min={0} disabled={disabled} onChange={(SpellLevel) => change({ SpellLevel })} />
          <Num label="Scales from level" value={n('BaseLevel')} min={0} disabled={disabled} onChange={(BaseLevel) => change({ BaseLevel })} />
          <Num label="Scales up to level" value={n('MaxLevel')} min={0} disabled={disabled} onChange={(MaxLevel) => change({ MaxLevel })} hint="0 = no limit." />
          <Pick label="Dispelled as" value={n('DispelType')} options={DISPEL_TYPES} disabled={disabled} onChange={(DispelType) => change({ DispelType })} />
        </div>
      </fieldset>
    </div>
  );
}

export function CastingTab({ record, change, lookups, disabled }: TabProps): React.JSX.Element {
  const n = (name: string): number => spellNum(record, name);
  const cast = useMemo(() => ids(lookups.castTimes), [lookups]);
  const ranges = useMemo(() => ids(lookups.ranges), [lookups]);
  const durations = useMemo(() => ids(lookups.durations), [lookups]);
  const castLabel = useMemo(() => (id: number) => castTimeLabel(lookups, id), [lookups]);
  const rangeText = useMemo(() => (id: number) => rangeLabel(lookups, id), [lookups]);
  const durationText = useMemo(() => (id: number) => durationLabel(lookups, id), [lookups]);
  const ms = (v: number): string | null => (v >= 1000 ? `= ${timeLabel(v)}` : null);
  return (
    <div className="spell-tab">
      <fieldset className="sheet-group" aria-label="Time and reach">
        <legend className="scene-section__title">Time and reach</legend>
        <div className="sheet-grid">
          <TablePick label="Cast time" value={n('CastingTimeIndex')} ids={cast} labelOf={castLabel} disabled={disabled} onChange={(CastingTimeIndex) => change({ CastingTimeIndex })} />
          <TablePick label="Range" value={n('RangeIndex')} ids={ranges} labelOf={rangeText} disabled={disabled} onChange={(RangeIndex) => change({ RangeIndex })} />
          <TablePick label="Lasts" value={n('DurationIndex')} ids={durations} labelOf={durationText} disabled={disabled} onChange={(DurationIndex) => change({ DurationIndex })} />
          <Num label="Projectile speed (yd/s)" value={n('Speed')} step="any" min={0} disabled={disabled} onChange={(Speed) => change({ Speed })} hint="0 = it lands at once." />
        </div>
      </fieldset>
      <fieldset className="sheet-group" aria-label="Cooldowns">
        <legend className="scene-section__title">Cooldowns</legend>
        <div className="sheet-grid">
          <Num label="Cooldown (ms)" value={n('RecoveryTime')} min={0} disabled={disabled} onChange={(RecoveryTime) => change({ RecoveryTime })} hint={ms(n('RecoveryTime'))} />
          <Num label="Category cooldown (ms)" value={n('CategoryRecoveryTime')} min={0} disabled={disabled} onChange={(CategoryRecoveryTime) => change({ CategoryRecoveryTime })} hint={ms(n('CategoryRecoveryTime')) ?? 'Shared by every spell of the category.'} />
          <Num label="Cooldown category" value={n('Category')} min={0} disabled={disabled} onChange={(Category) => change({ Category })} />
          <Num label="Global cooldown (ms)" value={n('StartRecoveryTime')} min={0} disabled={disabled} onChange={(StartRecoveryTime) => change({ StartRecoveryTime })} hint={n('StartRecoveryTime') === 0 ? 'Off the global cooldown.' : ms(n('StartRecoveryTime'))} />
          <Num label="Global cooldown category" value={n('StartRecoveryCategory')} min={0} disabled={disabled} onChange={(StartRecoveryCategory) => change({ StartRecoveryCategory })} hint="133 is the normal one." />
        </div>
      </fieldset>
      <fieldset className="sheet-group" aria-label="Interrupts">
        <legend className="scene-section__title">Interrupts</legend>
        <Mask label="Cast is interrupted by" bits={CAST_INTERRUPT_BITS} value={n('InterruptFlags')} disabled={disabled} onChange={(InterruptFlags) => change({ InterruptFlags })} />
        <Mask label="Channel is interrupted by" bits={AURA_INTERRUPT_BITS} value={n('ChannelInterruptFlags')} disabled={disabled} onChange={(ChannelInterruptFlags) => change({ ChannelInterruptFlags })} />
        <Mask label="Aura ends when the target" bits={AURA_INTERRUPT_BITS} value={n('AuraInterruptFlags')} disabled={disabled} onChange={(AuraInterruptFlags) => change({ AuraInterruptFlags })} />
      </fieldset>
    </div>
  );
}

const TICKING = new Set([3, 8, 20, 23, 24, 53, 89, 226]);

function EffectCard({ index, record, replace, lookups, describe, disabled }: TabProps & { index: number }): React.JSX.Element {
  const effect = effectOf(record, index);
  const set = (partial: Partial<typeof effect>): void => replace(withEffect(record, index, partial));
  const range = effectRange(effect);
  const radii = useMemo(() => ids(lookups.radii), [lookups]);
  const radiusText = useMemo(() => (id: number) => radiusLabel(lookups, id), [lookups]);
  const used = effect.effect !== 0;
  const aura = AURA_EFFECTS.has(effect.effect) || effect.aura !== 0;
  const n = index + 1;
  const mechanics = useMemo(() => [[0, 'None'] as const, ...MECHANICS.filter(([v]) => v !== 0)], []);
  return (
    <section className="spell-effect" aria-label={`Effect ${n}`}>
      <h4 className="scene-section__title">Effect {n}</h4>
      <p className="spell-effect__sentence" aria-live="polite">{effectSentence(effect, record, describe)}</p>
      <div className="sheet-grid">
        <Pick label="What it does" value={effect.effect} options={EFFECTS} disabled={disabled} onChange={(v) => set({ effect: v })} />
        {used && aura && <Pick label="Aura" value={effect.aura} options={AURAS} disabled={disabled} onChange={(v) => set({ aura: v })} />}
      </div>
      {used && (
        <>
          <div className="sheet-grid">
            <Num label="Value from" value={range.min} disabled={disabled} onChange={(min) => set(pointsFor(min, Math.max(min, range.max)))} />
            <Num label="Value to" value={range.max} disabled={disabled} onChange={(max) => { if (max >= range.min) set(pointsFor(range.min, max)); }} hint="Above 'from' for a random range." />
            <Num label="Plus per caster level" value={effect.perLevel} step="any" disabled={disabled} onChange={(perLevel) => set({ perLevel })} />
            {aura && <Num label="Ticks every (ms)" value={effect.period} min={0} disabled={disabled} onChange={(period) => set({ period })} hint={TICKING.has(effect.aura) || effect.period > 0 ? timeLabel(effect.period) : 'Only for periodic auras.'} />}
          </div>
          <div className="sheet-grid">
            <Pick label="Aims at (A)" value={effect.targetA} options={TARGETS} disabled={disabled} onChange={(targetA) => set({ targetA })} />
            <Pick label="And (B)" value={effect.targetB} options={TARGETS} disabled={disabled} onChange={(targetB) => set({ targetB })} hint="Used by area and cone shapes." />
            <TablePick label="Area radius" value={effect.radiusIndex} ids={radii} labelOf={radiusText} disabled={disabled} onChange={(radiusIndex) => set({ radiusIndex })} />
          </div>
          <div className="sheet-grid">
            <Num label="Misc value" value={effect.miscValue} disabled={disabled} onChange={(miscValue) => set({ miscValue })} hint="Meaning depends on the effect: a school mask, a stat, a creature entry." />
            <Num label="Misc value B" value={effect.miscValueB} disabled={disabled} onChange={(miscValueB) => set({ miscValueB })} />
            <SpellField id={`effect-${n}-trigger`} label="Casts spell" value={effect.triggerSpell} onChange={(triggerSpell) => set({ triggerSpell })} />
          </div>
          <details className="sheet-advanced">
            <summary>More for effect {n}</summary>
            <div className="sheet-grid">
              <Num label="Base points (raw)" value={effect.basePoints} disabled={disabled} onChange={(basePoints) => set({ basePoints })} hint="One less than the value." />
              <Num label="Dice sides (raw)" value={effect.dieSides} min={0} disabled={disabled} onChange={(dieSides) => set({ dieSides })} />
              <Pick label="Mechanic" value={effect.mechanic} options={mechanics} disabled={disabled} onChange={(mechanic) => set({ mechanic })} />
              <Num label="Chain targets" value={effect.chainTargets} min={0} disabled={disabled} onChange={(chainTargets) => set({ chainTargets })} />
              <Num label="Item created" value={effect.itemType} min={0} disabled={disabled} onChange={(itemType) => set({ itemType })} hint="For effects that create an item." />
              <Num label="Amplitude" value={effect.amplitude} step="any" disabled={disabled} onChange={(amplitude) => set({ amplitude })} />
              <Num label="Per combo point" value={effect.pointsPerCombo} step="any" disabled={disabled} onChange={(pointsPerCombo) => set({ pointsPerCombo })} />
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export function EffectsTab(props: TabProps): React.JSX.Element {
  return (
    <div className="spell-tab spell-effects">
      {[0, 1, 2].map((i) => <EffectCard key={i} {...props} index={i} />)}
    </div>
  );
}

export function AttributesTab({ record, change, disabled }: TabProps): React.JSX.Element {
  const [text, setText] = useState('');
  const needle = text.trim().toLowerCase();
  return (
    <div className="spell-tab">
      <p className="scene-hint">Named switches the client and the server read. Most spells need only a few; search by what you want to change.</p>
      <label className="scene-field">
        <span>Find a switch</span>
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="passive, stealth, cooldown…" />
      </label>
      {ATTRIBUTE_WORDS.map((w, i) => {
        const bits = needle === '' ? w.bits : w.bits.filter((b) => b.label.toLowerCase().includes(needle) || (b.help ?? '').toLowerCase().includes(needle));
        if (bits.length === 0) return null;
        return (
          <details key={w.field} className="sheet-advanced" open={i === 0 || needle !== ''}>
            <summary>{w.label}</summary>
            <Mask label={w.label} bits={bits} value={spellNum(record, w.field)} disabled={disabled} onChange={(v) => change({ [w.field]: v })} />
          </details>
        );
      })}
    </div>
  );
}

export function AdvancedTab({ record, change, disabled }: TabProps): React.JSX.Element {
  const [text, setText] = useState('');
  const id = useId();
  const needle = text.trim().toLowerCase();
  const fields = SPELL_FIELDS.map((f, i) => ({ f, i })).filter(({ f }) => needle === '' || f.name.toLowerCase().includes(needle));
  return (
    <div className="spell-tab">
      <p className="scene-hint">Every field of the Spell.dbc record, raw. Prefer the other tabs: a wrong number here can make a spell unusable.</p>
      <label className="scene-field" htmlFor={`${id}-filter`}>
        <span>Find a field</span>
        <input id={`${id}-filter`} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Reagent, Speed, Totem…" />
      </label>
      <div className="sheet-grid spell-raw">
        {fields.map(({ f, i }) =>
          f.kind === 's' ? (
            <TextField key={f.name} label={f.name} value={String(record[i] ?? '')} onChange={(v) => change({ [f.name]: v })} />
          ) : (
            <Num key={f.name} label={f.name} value={Number(record[i] ?? 0)} step={f.kind === 'f' ? 'any' : 1} disabled={disabled || f.kind === 'n'} onChange={(v) => change({ [f.name]: v })} />
          ),
        )}
      </div>
    </div>
  );
}
