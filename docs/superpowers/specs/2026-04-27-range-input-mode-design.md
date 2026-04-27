# Range Input Mode — Design

## Summary

Add a third factor-input mode (`Range`) to the DoE designer alongside the existing `Exact values` and `Level counts` modes. In Range mode the user supplies a min/max bound per factor; the DoE generation methods then sample within those bounds. Continuous methods (LHS, Orthogonal) sample real values directly; the discrete method (Full Factorial) discretises each range onto a per-factor grid before generating.

## Motivation

The two existing modes force the user to enumerate factor values up front. For continuous parameters (temperature, charge/discharge currents, termination thresholds), this means hand-picking levels and losing the main statistical benefit of LHS — coverage of the *continuous* factor space rather than a coarse user-defined grid. Range mode makes the bounds explicit and lets the sampling method choose where to test.

## UI / state model

### Mode toggle

The existing two-button toggle (`Exact values` / `Level counts`) becomes a three-button toggle with a new `Range` button. `state.inputMode` becomes `'values' | 'counts' | 'range'`. A new panel `mode-range` is shown when Range is selected; the other two panels (`mode-values`, `mode-counts`) are hidden.

Switching modes preserves each mode's inputs in state — no clearing.

### Range panel

One card per factor.

**Temperature / Charge load / Discharge load cards**: `Min`, `Max`, `Levels` numeric inputs. The `Levels` input is visually de-emphasised (greyed out, with the label "(full-factorial only)") when the selected DoE method is LHS or Orthogonal — it has no effect on those methods.

**Termination card**: two sub-sections, one for discharge and one for charge. Each sub-section has a type dropdown (reusing `DISCHARGE_TERM_TYPES` / `CHARGE_TERM_TYPES`) plus `Min` and `Max` numeric inputs. A single shared `Levels` input applies to the termination factor as a whole. The chosen types apply to *every* run produced by Range mode — the user is committing to a fixed pair of termination types and varying only the values.

### State shape

Each factor gains a parallel `range` field. Existing `.values` (numeric factors) and `.combinations` (termination) arrays remain untouched and continue to drive the other two modes.

```js
state.factors.temperature.range   = { min, max, levels };
state.factors.chargeLoad.range    = { min, max, levels };
state.factors.dischargeLoad.range = { min, max, levels };
state.factors.termination.range   = {
  dischargeType, dischargeMin, dischargeMax,
  chargeType,    chargeMin,    chargeMax,
  levels,
};
```

A new `syncStateFromRangeDOM()` reads the Range panel's inputs into `state.factors.*.range`. `syncStateFromDOM()` dispatches on `state.inputMode` to call the right reader.

## DoE generation in Range mode

Each generator receives a small dispatch on `state.inputMode === 'range'`.

### Full Factorial

Range mode discretises each factor first, then runs the existing full-factorial logic unchanged. A helper `compileRangeToValues(factorKey)` returns:

- For numeric factors: `linspace(min, max, levels)` rounded with `roundFor(factorKey, ...)`.
- For termination: an array of `levels` combo objects, each with the chosen types and values picked from the per-side linspaces. Discharge and charge values pair off element-wise (combo `i` uses index `i` of both linspaces) — so termination is a single `levels`-long list of combos, not a Cartesian product. This is the discrete analogue of the "single `u`" pairing used in continuous methods (see LHS below).

After this compile step, `generateFullFactorial` runs against the compiled value lists with no further changes.

### LHS

The Latin-hypercube construction (per-factor permutation of `[0..n-1]` strata, jittered to `u = (stratum + rand()) / n`) is unchanged. What changes is what `u` maps to.

The inner helper is refactored from "return an index into a list" to "return the sampled value for this factor on this run":

- **Discrete mode** (existing behaviour): `value = list[floor(u * list.length)]`.
- **Range mode**: `value = roundFor(factorKey, min + u * (max - min))`.

**Termination is treated as one factor in Range mode** — it gets one stratum permutation and a single `u` value per run, consistent with the single `Levels` input in the UI. The same `u` maps both the discharge and charge values:

```js
termCombo = {
  dischargeType: range.dischargeType,
  dischargeValue: roundFor('termination.discharge', range.dischargeMin + u * (range.dischargeMax - range.dischargeMin), range.dischargeType),
  chargeType: range.chargeType,
  chargeValue: roundFor('termination.charge', range.chargeMin + u * (range.chargeMax - range.chargeMin), range.chargeType),
};
```

This means discharge and charge termination values are perfectly correlated within a run — both sweep low-to-high together as `u` increases. This is the natural read of "termination = one factor with min/max bounds on each side". Users wanting independent termination axes can fall back to Exact-values mode with explicit combination rows.

`termComboIndex` continues to be set as a run-position index (1..n), preserving downstream renderer expectations.

### Orthogonal

Same shift as LHS. The "active factor" check becomes mode-aware:

- **Discrete mode**: `list.length > 1` (existing).
- **Range mode**: `range.min < range.max` (numeric factors), or "either discharge or charge range varies" for termination.

`pickListIdx(factorIdx, sampleIdx)` becomes `pickValue(factorIdx, sampleIdx)` and returns the rounded sample value directly. Constant factors (discrete with one value, or range with `min == max`) are excluded from the `d` count and held fixed across all runs — same handling as today.

## Rounding helper

A single `roundFor(factorKey, value, [terminationType])` maps factor → decimal places:

| Factor | Decimals |
|---|---|
| `temperature` | 1 |
| `chargeLoad` | 2 |
| `dischargeLoad` | 2 |
| `termination` (Voltage) | 3 |
| `termination` (Current) | 2 |
| `termination` (Time) | 0 |
| `termination` (other) | 2 |

Termination value precision keys off the *type*, not the factor — voltages need 3 dp, currents 2 dp, time-based criteria are integer seconds.

## Validation

`validateInputs` gains a Range branch that runs alongside the existing Exact-values and Counts branches.

- **Temperature range**: `min ≤ max`; both endpoints inside `[TEMP_MIN_ABSOLUTE, TEMP_MAX_ABSOLUTE]`.
- **Charge / Discharge ranges**: `min ≤ max`; both endpoints > 0.
- **Termination ranges**: `dischargeMin ≤ dischargeMax`; `chargeMin ≤ chargeMax`; both endpoints ≥ 0. No type-specific upper bounds (matches existing exact-values behaviour).
- **Levels per factor** (only checked when the selected method is Full Factorial): integer ≥ 1. If `levels == 1` and `min < max`, surface a warning (the factor collapses to `min`, ignoring `max`).
- **Empty / NaN inputs**: red-border + error message, matching exact-values treatment.

`min == max` is allowed everywhere — it represents a constant factor.

## Orthogonal badge

`countActiveOrthogonalFactors` gains a Range branch:

- Numeric factor active iff `range.min < range.max`.
- Termination active iff `dischargeMin < dischargeMax` or `chargeMin < chargeMax`.

The total-runs computation `M^d` is unchanged.

## CSV export

No schema change. Each run already carries a fully-formed `termCombo` object with type+value fields; the export writes those directly. Continuous samples flow through transparently.

## Edge cases

- **`min == max`**: treated as a constant single-value factor in every method. Equivalent to entering one exact value in Exact-values mode.
- **`levels == 1` with `min < max`**: warned (max is ignored) but not blocked; factor uses `min` as its single value in Full Factorial.
- **Same discharge type and charge type**: allowed, mirrors the existing combination-row behaviour.
- **All factors constant in Range mode**: produces one run, same as the discrete case (already handled in `generateOrthogonal` and naturally in the others).

## Out of scope

- Per-factor mode mixing (mixing Range with Exact values within a single DoE).
- User-configurable rounding precision (e.g. a Decimals input per factor).
- A full-factorial run-count preview badge.
- Type-specific upper bound validation on termination values.
- Any change to `termComboIndex` semantics or to downstream renderers / plots.
