# Range input mode — design

**Status:** Approved
**Date:** 2026-04-28
**Scope:** `doe-designer.html` (single-file app)

## Summary

Add a third factor-input mode, **Range**, alongside the existing **Level counts** and **Exact values** modes. In Range mode the user supplies `min` and `max` per factor; the continuous DoE sampling methods (Latin Hypercube Sampling, Orthogonal Sampling) sample within those bounds using stratum-midpoint values.

Method availability becomes mode-locked:

| Mode          | Full Factorial | LHS | Orthogonal |
| ------------- | -------------- | --- | ---------- |
| Range         | disabled       | ✔   | ✔          |
| Level counts  | ✔              | disabled | disabled |
| Exact values  | ✔              | disabled | disabled |

This separates two distinct DoE workflows that the tool was previously trying to share: factorial designs over user-specified discrete level sets vs. continuous space-filling designs over user-specified ranges.

## Motivation

LHS and Orthogonal Sampling are continuous space-filling methods. The existing implementation samples them over discrete value lists, which converts space-filling sampling into a stratified-fractional-factorial — useful, but loses the "I have ranges, not specific values" use case that motivates LHS/orthogonal in the first place.

Range mode adds the natural input form for continuous sampling: per-factor `[min, max]`. Locking method availability per mode prevents the most common user confusion ("why does my Orthogonal design only emit values from my pre-defined list?").

## User-visible changes

### Mode toggle

The mode-toggle (currently two buttons at `doe-designer.html:2179-2182`) becomes three:

```
[ Range ] [ Level counts ] [ Exact values ]
   ^default
```

`Range` is leftmost and is the default on first load.

### Range-mode panel

A new `<div id="mode-range">` panel mirrors the structure of `#mode-counts` and `#mode-values`. One factor card per row:

| # | Factor                  | Inputs                                                                  |
| - | ----------------------- | ----------------------------------------------------------------------- |
| 1 | Temperature             | min `°C`, max `°C`. Hint: "Valid range: −20 to 80 °C"                   |
| 2 | Charge load             | min, max + unit dropdown `[A / C-rate / W]`                             |
| 3 | Discharge load          | min, max + unit dropdown `[A / C-rate / W]`                             |
| 4 | Discharge termination   | type dropdown `[Voltage / Time / Energy Capacity / Charge Capacity / SOCmin]` + min, max with type-derived unit suffix |
| 5 | Charge termination      | type dropdown `[Voltage / Time / Energy Capacity / Charge Capacity / SOCmax]` + min, max with type-derived unit suffix |

The unit suffix on factors 4 and 5 updates live when the type dropdown changes (e.g. choose Voltage → `V`; choose SOCmin → `%`). Both bounds use the same unit as the chosen type.

Section hint at top of panel: "Specify min/max bounds per factor. LHS and Orthogonal Sampling will sample continuously within these ranges. Use Level counts mode for Full Factorial designs."

`min == max` is allowed and treats that factor as held constant. `min > max` is a validation error.

### Disabled-method visual treatment

Methods unavailable in the current mode remain visible but greyed out:

- The `<input type="radio">` gets the `disabled` attribute → unclickable.
- The wrapping `.method-option` gets a CSS class `.method-disabled` → opacity ≈ 0.45, `cursor: not-allowed`.
- The method's `.method-extra` panel collapses (existing `.hidden` mechanism).
- Hint text on disabled cards:
  - Full Factorial in Range: "Available in Level counts and Exact values modes."
  - LHS / Orthogonal in Levels/Values: "Available in Range mode only."

### Auto-reselection on mode switch

When the user switches modes, if the currently-selected method is invalid in the new mode, re-select a sensible default:

- → Range: re-select **LHS**.
- → Level counts or Exact values: re-select **Full Factorial**.

If the current method is still valid, leave it. (No method is valid in both Range and the levels modes today, so the "still valid" branch is for future-proofing.)

## Architecture

### State shape (additive)

```js
const state = {
  factors: {
    temperature:   { values: [], range: { min: null, max: null } },
    chargeLoad:    { values: [], unit: 'A', range: { min: null, max: null } },
    dischargeLoad: { values: [], unit: 'A', range: { min: null, max: null } },
    termination: {
      combinations: [],                            // existing — used in counts/values modes
      range: {                                     // new — used in range mode only
        discharge: { type: 'Voltage', min: null, max: null },
        charge:    { type: 'Voltage', min: null, max: null },
      },
    },
  },
  method: 'lhs',                                   // changed default (was 'fullFactorial')
  methodParams: {
    samples: 20,
    orthogonalSubdivisions: 2,
  },
  repeats:        1,
  inputMode:      'range',                         // changed default (was 'counts')
  plotTab:        '3d',
  highlightedRun: null,
  results:        null,
};
```

Notes:

- `range.min/max: null` is a sentinel for "not yet entered". Validation distinguishes blank from `0`.
- Both `values` and `range` coexist on each factor: Counts/Values modes read `values`, Range mode reads `range`. Mode-switching preserves data — switching Counts → Range → Counts keeps your level counts.
- `termination.range.discharge.type` defaults to `'Voltage'`; `termination.range.charge.type` likewise.
- `method: 'lhs'` is the default because Full Factorial is invalid in Range mode (the new default mode), and LHS lets the user pick any sample count — softer landing than Orthogonal's fixed `M^d` runs.

### Mode-method coupling

A new helper `getValidMethodsForMode(mode)` returns:

- `'range'` → `['lhs', 'orthogonal']`
- `'counts'` or `'values'` → `['fullFactorial']`

The existing inline mode-toggle handler (`doe-designer.html:1228-1248`) extracts into a function `setInputMode(mode)` that:

1. Flips `state.inputMode`.
2. Toggles `.hidden` on the three panels.
3. Calls a new `applyMethodAvailability()` which walks the three method radios, applies/removes the disabled class and attribute, collapses any newly-disabled `.method-extra`, and auto-reselects the default method if the current selection became invalid.
4. Re-runs `populateAxisSelects()` (so the plot axis dropdowns reflect the new factor list — see Plotting below).
5. Re-runs `updateOrthogonalBadge()` (so the M^n badge reflects the new active-factor count — see Sampling below).

### Sampling — continuous variants

Two new sampler functions sit alongside the existing `generateLHS` / `generateOrthogonal`. Discrete and continuous samplers do not share code: they have different inputs (discrete value lists vs. `[min, max]`) and different per-run output shapes (existing samplers emit `termCombo` + `termComboIndex`; continuous samplers emit separate discharge/charge type+value).

Both continuous samplers use **stratum-midpoint** sampling rather than uniform-within-stratum. With M=3 over `[10, 40]` °C the three temperatures are exactly `15, 25, 35` (stratum midpoints) — clean, reproducible experiment plans. Strata permutations remain random, so each "Generate" press still produces a fresh design across runs.

Five active dimensions in Range mode (vs. 4 in the existing samplers — termination splits into two independent factors):

1. `temperature`         — `[tMin, tMax]`
2. `chargeLoad`          — `[cMin, cMax]`
3. `dischargeLoad`       — `[dMin, dMax]`
4. `dischargeTermValue`  — `[dtMin, dtMax]` (with type `dischargeTermType`)
5. `chargeTermValue`     — `[ctMin, ctMax]` (with type `chargeTermType`)

A factor with `min === max` is held constant — every run gets that single value, and it does not count toward the active-dimension count `d` used in `M^d` for orthogonal.

#### `generateLHSContinuous(rangeFactors, n)`

```text
For each active factor f in [temperature, chargeLoad, dischargeLoad,
                            dischargeTermValue, chargeTermValue]:
  permute strata indices [0..n-1] independently  (Fisher-Yates)

For sample i in 0..n-1:
  for each active factor f with bounds [lo, hi]:
    s = perm_f[i]                               # which stratum (0..n-1)
    u = (s + 0.5) / n                           # midpoint within stratum
    value_f = lo + u * (hi - lo)
  for each held-constant factor f:
    value_f = lo                                # = hi by construction
  emit run { run: i+1, temperature, chargeLoad, dischargeLoad,
             dischargeTermType, dischargeTermValue,
             chargeTermType,    chargeTermValue }
```

Sample count `n` comes from `state.methodParams.samples`.

#### `generateOrthogonalContinuous(rangeFactors, M)`

Mirrors the existing discrete `generateOrthogonal` (`doe-designer.html:285-366`); the final step maps the fine-bin index to a continuous value using the bin midpoint:

```text
d = number of active factors (range > 0)
N = M^d, subBins = M^(d-1)

Build superCells (M^d combinations of super-bin indices across active dims)
For each active dim:
  partition cells by super-bin m, then assign each a unique fine-bin in
  [m*subBins .. (m+1)*subBins) via random permutation within the bin
  → fineBins[dim][cellIdx] in [0..N)

For sample i in 0..N-1:
  for each active factor f with bounds [lo, hi]:
    bin = fineBins[activeDim(f)][i]             # 0..N-1
    u   = (bin + 0.5) / N                       # midpoint within fine-bin
    value_f = lo + u * (hi - lo)
  for each held-constant factor f:
    value_f = lo
  emit run (same shape as LHS continuous)
```

Edge case `d = 0` (every factor pinned with `min == max`): emit a single run with all five constants. Mirrors the existing fallback at `doe-designer.html:302-311`.

Run-count cap: existing 10,000-run limit still applies. With 5 active factors at `M = 5`, `M^d = 3125` — well under the cap. The orthogonal-M input's `max="5"` (`doe-designer.html:2346`) does not need to change.

### Generate dispatch

`runGeneration` (`doe-designer.html:519-524`) gains range-mode branches:

```js
if (state.method === 'fullFactorial') {
  runs = generateFullFactorial(f);
} else if (state.method === 'lhs') {
  runs = state.inputMode === 'range'
    ? generateLHSContinuous(f, state.methodParams.samples)
    : generateLHS(f, state.methodParams.samples);
} else if (state.method === 'orthogonal') {
  runs = state.inputMode === 'range'
    ? generateOrthogonalContinuous(f, state.methodParams.orthogonalSubdivisions)
    : generateOrthogonal(f, state.methodParams.orthogonalSubdivisions);
}
```

### Run output schema (Range mode)

```js
{
  run: <int>,
  temperature:        <number>,         // °C
  chargeLoad:         <number>,         // in chargeLoad.unit
  dischargeLoad:      <number>,         // in dischargeLoad.unit
  dischargeTermType:  <string>,         // constant per generation
  dischargeTermValue: <number>,
  chargeTermType:     <string>,         // constant per generation
  chargeTermValue:    <number>,
}
```

There is **no** `termCombo` or `termComboIndex` on Range-mode runs — those are specific to the discrete combination factor used in counts/values modes. Downstream consumers branch on `state.inputMode === 'range'`.

Repeats are unchanged: each generated row is duplicated `state.repeats` times with re-indexed run numbers. The repeats logic is schema-agnostic and continues to work.

### Validation

A new branch in `runValidation` (`doe-designer.html:437-477`) runs when `state.inputMode === 'range'`:

- For each of the 5 factor entries:
  - `min` and `max` must both be non-blank numeric. Blanks are errors (no implicit zero).
  - `min ≤ max`. `min > max` is an error.
  - Range-specific bounds:
    - Temperature: `−20 ≤ min` and `max ≤ 80`.
    - Charge / Discharge load: `min ≥ 0`.
    - Termination values, type-dependent:
      - Voltage / Time / Energy Capacity / Charge Capacity: `> 0`.
      - SOCmin / SOCmax: `0 ≤ value ≤ 100`.
- Method-specific:
  - LHS: `samples ≥ 2` (existing rule, unchanged).
  - Orthogonal: `M ≥ 2`, `M^d ≤ 10000`, where `d` is the number of factors with `min < max` (capped at 5 in Range mode).

The "this configuration will produce N runs" warning becomes `M^d` for orthogonal in Range mode.

### Active-factor count (`countActiveOrthogonalFactors`)

Currently at `doe-designer.html:1174`, this helper counts factors with `> 1` level. It becomes mode-aware:

- In Counts/Values modes: existing logic (count factors with `values.length > 1`, plus 1 if termination combinations > 1).
- In Range mode: count entries among the 5 factors where `range.min < range.max`.

The orthogonal badge `M^n = ...` updates automatically through this helper.

## Plotting, results, parcoords, CSV

All four downstream surfaces read from `state.results` and a single source of truth: `getVarOptions()` (`doe-designer.html:654-672`). Add a Range-mode return.

### `getVarOptions()` — Range branch

```js
if (state.inputMode === 'range') {
  const f          = state.factors;
  const chargeUnit = f.chargeLoad.unit;
  const dischUnit  = f.dischargeLoad.unit;
  const dType      = f.termination.range.discharge.type;
  const cType      = f.termination.range.charge.type;
  const dUnit      = TERMINATION_UNITS[dType];
  const cUnit      = TERMINATION_UNITS[cType];
  return [
    { key: 'temperature',        label: 'Temperature (°C)' },
    { key: 'chargeLoad',         label: `Charge Load (${chargeUnit})` },
    { key: 'dischargeLoad',      label: `Discharge Load (${dischUnit})` },
    { key: 'dischargeTermValue', label: `Discharge Term: ${dType} (${dUnit})` },
    { key: 'chargeTermValue',    label: `Charge Term: ${cType} (${cUnit})` },
  ];
}
```

### 3D plot

Selectors at `doe-designer.html:2441-2443`. The existing `populateAxisSelects` (around `doe-designer.html:841`) rebuilds options from `getVarOptions()` and preserves selection — picks up the 5th option automatically. Defaults stay `temperature / chargeLoad / dischargeLoad`.

`computePlotAxis` (`doe-designer.html:697-727`) gains a Range-mode short path: for the new keys (`dischargeTermValue`, `chargeTermValue`) values are continuous numbers — no termComboIndex tick-array handling needed.

### 2D plot

Same — existing axis-selector population code generalises. Defaults stay `temperature / chargeLoad`.

### Results table

`doe-designer.html:373-419`. Range-mode columns:

```
Run | Temperature | Charge Load | Discharge Load | Discharge Term | Charge Term
```

The two term cells display `{value} {unit}` (e.g. `3.2 V`).

### Parallel coordinates plot

`doe-designer.html:860-940`. Currently 4 axes; Range mode gets 5. The axis-building loop generalises from `getVarOptions()`. The termination-axis special-casing for combo tick-maps (`doe-designer.html:879-880`) is skipped in Range mode (continuous numeric axes only).

### CSV download

`doe-designer.html:1055-1092`. Add a third branch:

```
Run, Temperature_degC,
ChargeLoad_<unit>, DischargeLoad_<unit>,
DischargeTermType, DischargeTermValue_<unit>,
ChargeTermType,    ChargeTermValue_<unit>
```

`<unit>` for termination columns is the unit of the chosen type (`V` / `s` / `Wh` / `Ah` / `%`). This mirrors the Exact-values CSV schema, so downstream tooling sees a consistent shape across both continuous-output modes.

The filename pattern `doe_${state.method}_${date}.csv` works as-is.

## Out of scope

- Mixed designs (some factors discrete, some continuous in the same run). The mode is global; each "Generate" produces one shape of design.
- Constraints between factors (e.g. "discharge load ≤ charge load"). Future work.
- Persistence (saving/loading designs) — not present today.
- D-optimal, Box-Behnken, fractional factorial, Plackett-Burman, DSD, or any other DoE methods. Future work.
- Range-mode for Full Factorial via per-factor levels-per-axis input (considered and rejected; users wanting a regular grid use Orthogonal with a chosen M).
- Tests / test infrastructure — project has none today; verification is manual (browser + DevTools console).

## Verification (manual)

After implementation, exercise these flows in a browser:

1. **First load:** mode toggle shows Range as active, LHS as selected method, Range panel visible, Full Factorial card greyed out with hint.
2. **Mode switch Range → Level counts:** Range panel hides, Counts panel appears, method auto-reselects to Full Factorial, LHS/Orthogonal cards greyed out.
3. **Switch back Counts → Range:** Range inputs preserved, level counts preserved on subsequent switch back to Counts.
4. **Generate with LHS, samples=10, all 5 factors with non-degenerate ranges:** results table shows 10 runs with continuous values inside each factor's range; CSV download has the new 8-column schema.
5. **Generate with Orthogonal, M=3, all 5 active:** results table shows 243 runs; orthogonal badge shows `M⁵ = 3⁵ = 243`.
6. **Pin one factor (`min == max`):** active-factor count drops by 1; orthogonal badge updates accordingly; that column is constant across all runs.
7. **Validation errors:** `min > max`, blank min/max, temperature out of `[−20, 80]`, SOC > 100 — each produces a clear error.
8. **Plotting:** 3D and 2D axis selectors offer all 5 factor labels (with units reflecting current termination type / load units); selecting `dischargeTermValue` and `chargeTermValue` plots them correctly.
9. **Parallel coordinates:** 5 axes, all numeric; brushing works.
