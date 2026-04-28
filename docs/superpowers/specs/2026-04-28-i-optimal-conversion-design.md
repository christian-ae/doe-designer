# Convert D-Optimal to I-Optimal — design

**Status:** Approved
**Date:** 2026-04-28
**Scope:** `doe-designer.html` (single-file app)

## Summary

Convert the existing D-Optimal Design method into **I-Optimal Design**. D-Optimal maximises `|X'X|` (parameter precision); I-Optimal minimises the **integrated prediction variance** over the candidate region — `trace((X'X)^-1 · W)` where `W` is the moments matrix of the candidate set. The two share the same Fedorov-exchange machinery, candidate set, and model-matrix encoding; only the optimisation criterion differs.

The conversion is a **replacement**, not an addition: D-Optimal disappears entirely. The Fedorov-exchange function is generalised to take a criterion parameter (`'D'` | `'I'`) so the D-path stays available internally for any future re-introduction, but no caller in this PR uses it.

## Motivation

D-optimal designs maximise `|X'X|` — they're optimal for *estimating* the model parameters precisely. But what users typically want from a designed experiment is good *predictions* across the design region: given the fitted model, how well does it predict at unseen points within the same factor space? That's the I-optimal objective:

```
T(X) = (1 / volume(R)) · ∫_R variance of prediction(z) dz
     = trace((X'X)^-1 · W)            (after the standard prediction-variance algebra)
```

For most engineering DoE use cases (battery degradation modelling included), prediction quality across the operating region is the goal — making I-optimal the more directly relevant criterion. Modern DoE tools (JMP, R `AlgDesign`) treat I-optimal as the default modern alternative to D-optimal for this reason.

## Method availability matrix (unchanged)

| Mode | Full Factorial | LHS | Orthogonal | **I-Optimal** |
| ------------- | -------------- | --- | ---------- | ------------- |
| Range         | disabled       | ✔   | ✔          | **disabled**  |
| Level counts  | ✔              | disabled | disabled | **✔**         |
| Exact values  | ✔              | disabled | disabled | **✔**         |

Same gating as D-Optimal had. `getValidMethodsForMode` swaps `'dOptimal'` → `'iOptimal'`. The disabled-method hint text is unchanged.

## User-visible changes

### Method radio + extras panel

The label changes from "D-Optimal Design" to "I-Optimal Design". The model-form radio group, run-count input, and info badge layout are identical. The hint paragraph wording changes:

> Algorithmically constructs a design that **minimises the average prediction variance** over the candidate region — useful when run count is fixed and you care most about how well the design predicts within the region of interest. Uses Fedorov exchange with 5 random restarts. Each Generate gives a fresh design.

(Was: "minimises |X'X|" — wording flipped to match the new objective.)

The disabled-mode hint stays "Available in Level counts and Exact values modes."

### Naming map (D → I)

| Component | Before | After |
| --- | --- | --- |
| Method radio label | "D-Optimal Design" | "I-Optimal Design" |
| `state.method` value | `'dOptimal'` | `'iOptimal'` |
| Method radio id | `radio-dOptimal` | `radio-iOptimal` |
| Extras panel id | `extra-dOptimal` | `extra-iOptimal` |
| Run-count input id | `input-doptimal-runs` | `input-ioptimal-runs` |
| Model radio name | `doptimal-model` | `ioptimal-model` |
| Badge ids | `doptimal-candidate-count`, `doptimal-param-count`, `doptimal-min-runs` | `ioptimal-candidate-count`, `ioptimal-param-count`, `ioptimal-min-runs` |
| State params | `dOptimalModel`, `dOptimalRuns` | `iOptimalModel`, `iOptimalRuns` |
| Generator function | `generateDOptimal` | `generateIOptimal` |
| Param-count helper | `dOptimalParamCount` | `iOptimalParamCount` |
| Badge updater | `updateDOptimalBadge` | `updateIOptimalBadge` |
| Live-edit flag | `userEditedDOptimalRuns` | `userEditedIOptimalRuns` |
| Display labels | `D-Optimal main+2FI, N=17` | `I-Optimal main+2FI, N=17` |
| Validation strings | "D-Optimal: …" | "I-Optimal: …" |

The candidate-set, model-matrix encoder, active-factor helpers, Gauss-Jordan helper, and `fisherYates` are all **unchanged**: they're criterion-agnostic.

## Architecture

### The optimization criterion

I-optimal minimises:

```
T(X) = trace((X'X)^-1 · W)
```

where `W` (the **moments matrix**) is the candidate-set average of outer products:

```
W = (1 / |C|) · M' · M
```

`M` is the |C| × p model matrix evaluated over **all candidates**, already built by `encodeAsModelMatrix`. `W` is `p × p`, symmetric positive semi-definite.

`W` is computed **once per Generate** (constant across the 5 Fedorov restarts and across all iterations within each restart) — cost O(|C| · p²), well under 100 µs at our problem sizes.

### Closed-form Δ for swap (i, j)

Let `A = (X'X)^-1` for the current design and `B = A · W · A` (a one-time O(p³) precompute per Fedorov iteration). Define per-row precomputes:

```
s_i = A · x_i           (vector, p-dim)
α_i = x_i' · s_i        (scalar, = leverage d_ii)
t_i = B · x_i           (vector, p-dim)
η_i = x_i' · t_i        (scalar)
```

For each swap pair `(i in design, j ∉ design)`:

```
γ      = s_i · x_j               // = x_i' · A · x_j
ρ      = γ / (1 − α_i)
η_ij   = t_i · x_j               // = x_i' · B · x_j (and = t_j · x_i by symmetry of B)
v²     = η_j + 2·ρ·η_ij + ρ²·η_i // (η_j ≡ x_j' · B · x_j)
denom  = 1 + α_j + γ² / (1 − α_i)
ΔI     = η_i / (1 − α_i) − v² / denom
```

A swap improves T iff `ΔI < 0`. The Fedorov inner loop picks the swap with the most-negative ΔI per iteration and stops when no swap satisfies `ΔI < −EPS`.

**Cost per iteration:** O((N + |C|) · p²) precompute + O(N · |C| · p) inner loop. For N=17, |C|=54, p=11: ~80K precompute ops + ~10K inner-loop ops per iteration. Each Generate (5 restarts × ~10 iterations) finishes in well under 50 ms.

**Implementation note:** after accepting a swap, the algorithm recomputes `A` from scratch (matches the existing D-optimal recipe). `B = A · W · A` is also recomputed from the new `A`. This keeps the code path simple at the cost of a small constant-factor speedup that Sherman-Morrison would buy.

### Generalised `fedorovExchange`

The existing `fedorovExchange(candidatesM, N)` becomes:

```js
fedorovExchange(candidatesM, N, criterion = 'I', W = null)
```

- `criterion`: `'D'` or `'I'`. The inner loop's per-pair Δ formula and "improvement" direction (D maximises, I minimises) branch on this.
- `W`: required for `'I'`, ignored for `'D'`.
- Return: `{ design, det, trace }`. `det` is always populated (final `|X'X|`); `trace` is `T(X)` populated only for `'I'`. The wrapper compares restarts using the relevant field.

The D-path stays in the function for completeness but no caller in this PR uses it.

### `generateIOptimal` wrapper

Mirrors `generateDOptimal` 1:1 with three changes:

1. After `encodeAsModelMatrix`, compute `W = (1/|C|) · M' · M` via a new `computeMomentsMatrix(M)` helper.
2. Pass `'I'` and `W` to `fedorovExchange`.
3. Compare restarts by `result.trace` (smaller is better) instead of `result.det`.

```js
function generateIOptimal(factors, modelForm, N) {
  const NUM_RESTARTS = 5;

  const activeIdxs = getActiveFactorIndices(factors);
  if (activeIdxs.length === 0) {
    throw new Error('I-Optimal: at least one factor must have more than one level.');
  }
  const C = buildCandidateSet(factors);
  if (N > C.length) {
    throw new Error(`I-Optimal: requested ${N} runs exceeds the ${C.length} candidate points; I-Optimal cannot pick more rows than exist in the Cartesian product of the factor values.`);
  }
  const p = iOptimalParamCount(modelForm, activeIdxs.length);
  if (N < p) {
    throw new Error(`I-Optimal: number of runs (N=${N}) must be ≥ N model parameters (p=${p}).`);
  }

  const M = encodeAsModelMatrix(C, factors, modelForm, activeIdxs);
  const W = computeMomentsMatrix(M);

  let bestDesign = null;
  let bestTrace  = Infinity;
  for (let r = 0; r < NUM_RESTARTS; r++) {
    const result = fedorovExchange(M, N, 'I', W);
    if (result.design !== null && result.trace < bestTrace) {
      bestDesign = result.design;
      bestTrace  = result.trace;
    }
  }
  if (bestDesign === null) {
    throw new Error('I-Optimal: could not find a non-singular starting design — try increasing run count or reducing model complexity.');
  }

  return bestDesign.map((idx, i) => ({
    run:            i + 1,
    temperature:    C[idx].temperature,
    chargeLoad:     C[idx].chargeLoad,
    dischargeLoad:  C[idx].dischargeLoad,
    termCombo:      C[idx].termCombo,
    termComboIndex: C[idx].termComboIndex,
  }));
}
```

### `computeMomentsMatrix(M)` — new helper

Returns the p × p matrix `(1/|C|) · M' · M`. Lives next to `encodeAsModelMatrix` so the two are read together.

```js
function computeMomentsMatrix(M) {
  const C = M.length;
  const p = M[0].length;
  const W = Array.from({ length: p }, () => new Array(p).fill(0));
  for (const row of M) {
    for (let i = 0; i < p; i++) {
      const ri = row[i];
      for (let j = 0; j < p; j++) {
        W[i][j] += ri * row[j];
      }
    }
  }
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      W[i][j] /= C;
    }
  }
  return W;
}
```

### Generate dispatch

Replace the `dOptimal` branch in `runGeneration`:

```js
} else if (state.method === 'iOptimal') {
  runs = generateIOptimal(f, state.methodParams.iOptimalModel, state.methodParams.iOptimalRuns);
}
```

### Run output schema

Unchanged from D-Optimal — output rows match the existing Full Factorial schema, so all display surfaces (table, plots, parcoords, CSV) work without modification.

## Validation

The existing D-Optimal validation block becomes I-Optimal with the rename map applied. Same structure, same thresholds, only the message strings change ("D-Optimal:" → "I-Optimal:").

- Hard errors: non-integer / non-positive N; zero active factors; N < p; N > candidate count.
- Soft warnings: N > 0.5 × candidate count; N > 100.

## Display labels

`methodShort` and `methodLong` get the renamed entries:

```js
methodShort.iOptimal = `I-Optimal ${modelFormShort(iM)}, N=${iN}`;
methodLong.iOptimal  = `I-Optimal Design (${modelFormLong(iM)}, N=${iN})`;
```

The `modelFormShort` / `modelFormLong` helpers stay — they're criterion-agnostic.

## Live UI updates

The `userEditedIOptimalRuns` flag, the run-count input listener, the model-form radio listeners, and the panel-input observer in `init` all swap `dOptimal*` → `iOptimal*` in their references. Behaviour is identical: editing the run-count input flips the user-edited flag; switching the model form auto-recomputes the run-count default unless the flag is set.

## Out of scope

- A-optimal, V-optimal, G-optimal, custom optimality criteria.
- Other implementations of I-optimal that use a non-uniform region weight (e.g. weighting by user importance per factor combination).
- Constrained design spaces (excluding certain combinations from the candidate set).
- Quadratic / response-surface model form.
- Sherman-Morrison inverse maintenance (recompute-per-iteration is still fast enough at our scale).
- Restoring D-Optimal as a user-selectable method — the D-path stays in `fedorovExchange` for code completeness but no UI surface exposes it.

## Verification (manual + Node)

After implementation:

**Browser flow:**
1. On first load: I-Optimal radio appears as the fourth option (replacing D-Optimal). In Range mode it's greyed out with the existing hint. In Counts/Values modes it's enabled.
2. Default state: model = main+2FI, params = 11, min runs = 11, runs = 17, candidate count = 54.
3. Generate produces 17 distinct rows; UI surfaces (table, plots, parcoords, CSV) all render unchanged.
4. Switching model to "Main effects only" updates badge to params=5, min runs=5, runs auto-defaults to 8.
5. Validation errors fire for N < p, N > candidate count, all factors at 1 level, non-integer N.
6. Soft warnings fire for N > 0.5·|C| and N > 100.
7. Header / legend show "I-Optimal Design (main effects + 2-factor interactions, N=17)".

**Node sanity (extracted into `/tmp/test-iopt.js`):**

```js
// Same 2^4 synthetic set used to validate D-optimal.
// At N=8 main-effects, the optimal half-fraction maximises |X'X| = 32768 AND
// minimises trace((X'X)^-1 · W). Both criteria pick the same design.
const r = generateIOptimal(factors, 'main', 8);
console.assert(r.length === 8);
// Verify |X'X| = 32768 (criterion-agnostic check on optimum)
// Verify trace((X'X)^-1 · W) is at the analytical minimum
```

For the asymmetric case (different range scales per factor, more candidates than runs), I-optimal will produce a different design from D-optimal — the I-optimal design will have lower average prediction variance but possibly lower `|X'X|`. We verify the trace is monotone-non-increasing across Fedorov iterations and that the final trace is at least no worse than the trace of any random N-row subset.
