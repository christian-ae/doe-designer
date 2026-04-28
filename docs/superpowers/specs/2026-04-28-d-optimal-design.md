# D-Optimal DoE method — design

**Status:** Approved
**Date:** 2026-04-28
**Scope:** `doe-designer.html` (single-file app)

## Summary

Add a fourth DoE method, **D-Optimal Design**, alongside Full Factorial, Latin Hypercube Sampling, and Orthogonal Sampling. D-Optimal algorithmically constructs a design that maximises `|X'X|` of the model matrix — useful when the run budget is fixed, the design space is irregular, or standard factorial/space-filling designs don't fit. The user picks a model form (main effects, or main effects + 2-factor interactions) and a target run count `N`; the algorithm chooses the `N` rows from the Cartesian-product candidate set that best estimate the chosen model.

D-Optimal is **only available in Level counts and Exact values modes**. In Range mode the existing LHS/Orthogonal continuous samplers already cover the "I have ranges" use case, and D-Optimal needs a discrete candidate set.

## Method availability matrix (updated)

| Mode | Full Factorial | LHS | Orthogonal | **D-Optimal** |
| ------------- | -------------- | --- | ---------- | ------------- |
| Range         | disabled       | ✔   | ✔          | **disabled**  |
| Level counts  | ✔              | disabled | disabled | **✔**         |
| Exact values  | ✔              | disabled | disabled | **✔**         |

`getValidMethodsForMode()` (added in the Range PR) updates:

- `'range'` → `['lhs', 'orthogonal']` (unchanged)
- `'counts'` or `'values'` → `['fullFactorial', 'dOptimal']` (was `['fullFactorial']`)

The disabled-method hint when D-Optimal is unavailable: "Available in Level counts and Exact values modes." (Same hint shown today on Full Factorial when in Range mode.)

## User-visible changes

### Method radio + extras panel

A new `<div class="method-option">` is added after Orthogonal in the DoE Method section:

```
○ Full Factorial
○ Latin Hypercube Sampling
○ Orthogonal Sampling
○ D-Optimal Design
```

When D-Optimal is selected, the method-extras panel shows:

- **Model form** — radio group:
  - "Main effects only"  *(`p = 1 + activeCount` parameters)*
  - "Main effects + 2-factor interactions"  *(`p = 1 + activeCount + C(activeCount, 2)` parameters)* — **default**
- **Number of runs** — numeric input. Default = `ceil(1.5 × p)`. Minimum = `p`.
- **Info badge** — three live-updating numbers:
  - Candidate points (Cartesian product size of the active factor value lists)
  - Parameters (`p` for the chosen model + active factor count)
  - Min runs (= `p`)
- **Hint paragraph** — short explanation of what D-Optimal does, mentioning the algorithm and that each Generate produces a fresh design.

### Live-update behaviour

- Switching the model form radio recomputes `p`, updates the parameter and min-runs displays, and refreshes the run-count default if the user hasn't manually edited the input.
- Editing factor inputs (level counts in counts mode, value lists in values mode, termination combinations) recomputes the candidate count and `activeCount`-driven `p`.
- Mode toggles (`setInputMode` flow) re-evaluate D-Optimal availability via the existing `applyMethodAvailability()`.

## State shape additions

```js
const state = {
  factors: { /* unchanged */ },
  method: 'lhs',                                   // unchanged default (Range mode)
  methodParams: {
    samples:                20,
    orthogonalSubdivisions: 2,
    dOptimalModel:          'main2fi',             // new — 'main' | 'main2fi'
    dOptimalRuns:           17,                    // new — user-editable; default = ceil(1.5 × p)
  },
  repeats:        1,
  inputMode:      'range',
  plotTab:        '3d',
  highlightedRun: null,
  results:        null,
};
```

The default `dOptimalRuns: 17` is `ceil(1.5 × 11)` for the default `'main2fi'` model with 4 active factors. It's seeded so first-time users can hit Generate immediately. The field is live-recomputed when the model dropdown or active-factor count changes — but only if the user hasn't manually edited it (track an `userEditedDOptimalRuns` flag, same UX pattern as the existing LHS samples / Orthogonal M inputs).

## Architecture

### Algorithm — Fedorov exchange (pure JS, no external dependency)

D-Optimal is a discrete-search optimisation: pick `N` rows out of `|C|` candidates to maximise `|X'X|` where `X` is the model matrix evaluated at those rows. Classical Fedorov exchange:

1. Start with `N` random distinct candidates.
2. For each row `i` currently in the design and each candidate `j` not in the design, compute the **Δ-criterion** — how much `|X'X|` would increase if we swap row `i` out for candidate `j`.
3. Apply the best swap; recompute. Stop when no swap improves `|X'X|`.
4. Repeat with a different random starting point. Five restarts; keep the best.

The Δ-criterion has a closed form:

```
Δ_ij = (1 + d_jj)·(1 - d_ii) + d_ij² - 1

where d_ii = x_i' (X'X)^-1 x_i              (leverage of point i)
      d_jj = x_j' (X'X)^-1 x_j              (leverage of candidate j)
      d_ij = x_i' (X'X)^-1 x_j              (cross term)
```

A swap improves `|X'X|` iff `Δ_ij > 0`. The algorithm picks the swap with the largest positive Δ each iteration.

**Key constants:**
- `NUM_RESTARTS = 5`
- `MAX_ITERATIONS = 100` per restart (defensive cap; convergence usually in 5–20 iterations)
- `EPS = 1e-9` (minimum Δ to count as improvement)

### Pseudocode

```text
function generateDOptimal(factors, modelForm, N):
  C = buildCandidateSet(factors)                  // array of candidate run objects
  M = encodeAsModelMatrix(C, modelForm, factors)  // |C| × p
  p = M[0].length

  if N < p:                throw "N must be >= p"
  if N > C.length:         throw "N exceeds candidate count"

  bestDesign = null
  bestDet    = -Infinity

  for restart in 1..NUM_RESTARTS:
    design = pickRandomDistinctIndices(C.length, N)
    if not initialiseDesignNonSingular(M, design):
      continue                                    // rerolled up to 20× before giving up

    for iter in 1..MAX_ITERATIONS:
      X     = M[design, :]
      XtX   = matMul(X.T, X)
      lu    = luDecompose(XtX)
      detX  = lu.det
      Xinv  = lu.inverse()

      bestΔ    = EPS
      bestSwap = null
      for i in 0..N-1:
        x_i = M[design[i], :]
        d_ii = quadForm(x_i, Xinv)
        for j in 0..|C|-1:
          if j in design: continue
          x_j = M[j, :]
          d_jj = quadForm(x_j, Xinv)
          d_ij = bilinear(x_i, Xinv, x_j)
          Δ    = (1 + d_jj) * (1 - d_ii) + d_ij*d_ij - 1
          if Δ > bestΔ:
            bestΔ    = Δ
            bestSwap = (i, j)

      if bestSwap == null: break
      design[bestSwap.i] = bestSwap.j
      // detX *= (1 + bestΔ)  — implicit; we'll recompute on next loop iter

    if detX > bestDet:
      bestDet    = detX
      bestDesign = design.slice()

  if bestDesign == null:
    throw "D-Optimal: could not find a non-singular starting design — try increasing run count or reducing model complexity."

  return bestDesign.map((idx, i) => ({...C[idx], run: i + 1}))
```

### Model matrix encoding

For each candidate row, build a row of the model matrix. Encoding rules:

**Numeric factors** (temperature, chargeLoad, dischargeLoad in values mode; or 1..N level codes in counts mode):

Coded to `[-1, 1]` using min/max scaling across the factor's value list:

```
codedValue = 2 × (rawValue - min) / (max - min) - 1
```

**Termination factor** (Approach A from brainstorm — numeric ordinal): treated as a numeric column whose values are the 1-indexed combination position, then min/max-scaled to `[-1, 1]` like any other numeric factor.

**Held-constant factors** (only one level / value): contribute no information. Their main-effect column is dropped from the model entirely, and any 2FI involving them is dropped as well. This keeps `X'X` invertible. The active-factor count `activeCount` drives parameter counting.

**Model matrix layout (main+2FI, all 4 factors active):** 11 columns:
`intercept, T, CL, DL, TC, T·CL, T·DL, T·TC, CL·DL, CL·TC, DL·TC`

**Main effects only, all 4 factors active:** 5 columns:
`intercept, T, CL, DL, TC`

### LU-based determinant + inverse helper

A small pure-JS helper (~30 lines) handles the matrix operations on the small `p × p` matrix:

- LU decomposition with partial pivoting on `XtX`
- Determinant = product of diagonal entries of `U`, with sign from the pivot permutation
- Inverse via LU forward/back substitution against the identity matrix

`p ≤ 11` for this design's factor count, so numerical stability is excellent (after `[-1, 1]` coding `XtX` is well-conditioned). The helper lives near the existing samplers.

### Edge cases

- **Singular initial design**: random selection of N rows occasionally produces a singular `X'X` (e.g. duplicate coded rows). Detected by `|det| < 1e-12`; that restart is re-rolled. After 20 consecutive singular restarts, the algorithm gives up with a clear error.
- **Degenerate factor set** (no active factors): caught upstream by validation.
- **N ≥ candidate count**: caught upstream by validation. (When `N == |C|` the design *is* the full factorial.)
- **Very large candidate sets** (e.g. 5⁴ × 4 = 2500 candidates): runtime scales as `O(N × |C| × p²)` per iteration. For 11-parameter, 100-candidate, 17-run designs, ≈ 11² × 17 × 100 = 200K ops × ~10 iterations × 5 restarts ≈ 10M ops total — well under 100ms in V8.

### Generate dispatch

`runGeneration` (added in the Range PR) gains a fourth branch:

```js
if (state.method === 'fullFactorial') {
  runs = generateFullFactorial(f);
} else if (state.method === 'lhs') {
  runs = isRange ? generateLHSContinuous(f, n) : generateLHS(f, n);
} else if (state.method === 'orthogonal') {
  runs = isRange ? generateOrthogonalContinuous(f, M) : generateOrthogonal(f, M);
} else if (state.method === 'dOptimal') {
  runs = generateDOptimal(f, state.methodParams.dOptimalModel, state.methodParams.dOptimalRuns);
}
```

D-Optimal does not have a Range-mode variant — the method is gated off in Range mode and `runGeneration` will never see this branch fire there.

### Run output schema

D-Optimal selects rows from the existing Cartesian-product candidate set, so each emitted run has the same shape as Full Factorial output:

- **Counts mode**: `{ run, temperature, chargeLoad, dischargeLoad, termComboIndex }`
- **Values mode**: `{ run, temperature, chargeLoad, dischargeLoad, termCombo, termComboIndex }`

This means **every existing display surface** (`renderTable`, `getVarOptions`, `computePlotAxis`, `renderParCoords`, `downloadCSV`) works without modification — D-Optimal output looks like a sparse subset of Full Factorial output to downstream consumers.

## Validation

A new branch in `validateInputs()` runs when `state.method === 'dOptimal'`:

```
1. Compute paramCount p:
   - 'main':    p = 1 + activeCount
   - 'main2fi': p = 1 + activeCount + C(activeCount, 2)

2. Hard errors (block generate):
   - dOptimalRuns must be an integer ≥ 1
   - dOptimalRuns ≥ p
       "D-Optimal: number of runs (N) must be ≥ N model parameters
        (p = <value>) — increase runs or switch to a smaller model."
   - At least one factor must have >1 level / >1 combination
       "D-Optimal: at least one factor must have more than one level."
   - dOptimalRuns ≤ candidate count
       "D-Optimal: requested N runs exceeds the <candidate count> candidate
        points; D-Optimal cannot pick more rows than exist in the Cartesian
        product of the factor values."

3. Soft warnings (don't block generate):
   - dOptimalRuns > 0.5 × candidate count
       "D-Optimal: requested >50% of the candidate points — at this density
        the design approaches full factorial. Consider reducing N or using
        Full Factorial."
   - dOptimalRuns > 100
       "D-Optimal: <N> runs is large — consider whether a screening design
        (LHS in Range mode) would suit better."
```

Existing factor and repeats validations apply unchanged.

## Display label maps

Small additions for the results header / legend at the existing `methodShort` / `methodLong` maps. A helper translates the `modelForm` enum to a readable string for display:

```js
const modelFormShort = mf => mf === 'main2fi' ? 'main+2FI' : 'main';
const modelFormLong  = mf => mf === 'main2fi' ? 'main effects + 2-factor interactions' : 'main effects only';

methodShort: {
  fullFactorial: 'Full Factorial',
  lhs:           'Latin Hypercube',
  orthogonal:    `Orthogonal M=${M}`,
  dOptimal:      `D-Optimal ${modelFormShort(modelForm)}, N=${N}`,
}
methodLong: {
  fullFactorial: 'Full Factorial',
  lhs:           'Latin Hypercube Sampling',
  orthogonal:    `Orthogonal Sampling (M=${M})`,
  dOptimal:      `D-Optimal Design (${modelFormLong(modelForm)}, N=${N})`,
}
```

## Out of scope

- Quadratic / response-surface model form (option C from brainstorm). Considered and deferred — adds complexity (needs ≥3 levels per numeric factor; collinearity issues with 2-level factors). Easy follow-up if needed: extend `dOptimalModel` enum and the model-matrix builder.
- Categorical encoding for the termination factor (one-hot / contrast dummies — option B from brainstorm). Numeric ordinal encoding (option A) chosen.
- Mixed-level fractional factorial designs.
- I-optimal, A-optimal, V-optimal, G-optimal, custom optimality criteria.
- Constrained design spaces (excluding certain combinations from the candidate set).
- Coordinate-exchange or k-exchange algorithms (Approach 2 from brainstorm). Approach 1 (classical Fedorov) chosen for simplicity.
- External library dependency (Approach 3 from brainstorm). Pure JS chosen.
- Range-mode D-Optimal. The method is gated off there.
- Sherman-Morrison rank-1 updates for inverse maintenance. Recompute-per-iteration is fast enough at this scale.
- Tests / test infrastructure — project has none today; verification is manual (browser + DevTools console).

## Verification (manual)

After implementation, exercise these flows in a browser:

1. **Method availability:** D-Optimal radio appears as a fourth option. In Range mode it's greyed out with the hint. In Counts and Values modes it's enabled and selectable.
2. **Default state:** when D-Optimal is selected for the first time (in Counts mode with default 3-3-3-2 levels), the panel shows: model = main+2FI, params = 11, min runs = 11, runs = 17, candidate count = 54.
3. **Model toggle:** switching to "Main effects only" updates params to 5 and min runs to 5; runs auto-defaults to 8 (= ceil(1.5 × 5)) since the user hasn't manually edited the input.
4. **Active-factor count:** setting one factor to 1 level / value drops `activeCount` to 3; main+2FI params becomes 1+3+3 = 7; min runs becomes 7.
5. **Generate (counts mode, default settings):** produces 17 distinct runs from the 54-candidate space; the results table shows level codes; CSV downloads with the existing 5-column counts schema.
6. **Generate (values mode):** real numeric values appear in the results table; CSV uses the existing 8-column values schema.
7. **3D / 2D plots and parcoords:** unchanged behaviour — D-Optimal rows display correctly.
8. **Validation errors fire for:**
   - `N < p` (e.g. N=5 with main+2FI requiring 11)
   - `N > candidate count` (e.g. N=100 with 54 candidates)
   - All factors at 1 level
   - Non-integer or negative N
9. **Soft warning fires for:** `N > 0.5 × candidates` (e.g. N=30 with 54 candidates).
10. **Repeats:** a 17-run D-Optimal design with `repeats=3` produces 51 cells in the experiment-stats display.
11. **Determinism:** each Generate produces a fresh design (random restarts), but the design quality (final `|X'X|`) should be similar across runs for the same configuration.

DevTools sanity check (after Generate):
```js
state.results.length;                          // matches dOptimalRuns
state.results[0].run;                          // 1
state.results[state.results.length - 1].run;   // matches dOptimalRuns
new Set(state.results.map(r =>                 // distinct candidate selection
  `${r.temperature}|${r.chargeLoad}|${r.dischargeLoad}|${r.termComboIndex}`
)).size;                                       // == state.results.length
```
