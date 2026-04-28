# I-Optimal Avg. Variance Display — Design Spec

**Date:** 2026-04-29
**Branch:** `i-optimal-method`
**Status:** Approved by user

## Goal

Surface the I-optimal design's average prediction variance (the I-criterion value)
to the user as a stat in the experiment-summary row above the plots, so they can
read the design quality at a glance alongside Runs / Repeats / Total cells / Method.

## Background

`generateIOptimal` already minimises `trace((X'X)^-1 · W)` over Fedorov restarts
and computes the final `bestTrace` value. With the candidate-set moments matrix
`W = (1/|C|) · M'M`, this trace is the average prediction variance over the
candidate set in coded units — i.e. the I-criterion itself. Today the value is
discarded after run selection, so the user has no visibility into design quality.

## Scope

**In scope:** Show one new stat cell labelled `Avg. variance`, populated only when
the active method is I-Optimal and a generated design exists. Hidden otherwise.

**Out of scope:**
- Tooltips, hover help, or extended explainers (the existing I-Optimal hint
  paragraph already documents the criterion).
- Including the variance in the table, CSV export, plots, or run-details.
- Showing variance for any other method (LHS, Orthogonal, Full Factorial).
- Comparing variance across methods or across runs of the same method.

## User-visible behaviour

The `.plot-summary` row currently has four cells:

```
[ Runs ] [ Repeats ] [ Total cells ] [ Method ]
```

After this change, when `state.method === 'iOptimal'` and a design has been
generated, it shows five:

```
[ Runs ] [ Repeats ] [ Total cells ] [ Avg. variance ] [ Method ]
```

For all other methods, the row remains four cells — the new cell's parent
`.summary-stat` is hidden via `display: none`.

**Format:** the variance value is rendered with the existing `fmt(value)` helper
(4 significant figures, matching how factor values are displayed elsewhere).

**Empty state:** when `state.results` is null (initial load, after factor edits
that invalidate results), the cell behaves like the others — the `.plot-summary`
row is part of `#results` which is `.hidden` until a design exists. Inside the
existing "no results yet" branch of `updateExperimentDisplays`, the variance cell
is also reset to `—` and hidden, so a stale value never lingers.

## Implementation

### State

Add one sibling field on the global state:

```js
state.iOptimalTrace = null;  // number when method=iOptimal & results valid; else null
```

This sits next to `state.results`, not inside it. Rationale: `state.results` is
consumed as a plain `Run[]` array by `renderTable`, `renderPlots`, `renderParCoords`,
parcoords-row hover, the table-row hover-sync, and CSV export. Wrapping it in an
object would touch every consumer for no benefit. A sibling field keeps the blast
radius to the I-Optimal codepath and the stats display.

### `generateIOptimal` return shape

Change the return type from `Run[]` to `{ runs: Run[], trace: number }`. The
function already has `bestTrace` in scope after the restart loop — return it
alongside the runs.

```js
function generateIOptimal(factors, modelForm, N) {
  // … existing body …
  const runs = bestDesign.map((idx, i) => ({ … }));
  return { runs, trace: bestTrace };
}
```

### Dispatcher (`validateAndGenerate`)

The dispatcher's I-Optimal branch destructures both fields and stores them:

```js
} else if (state.method === 'iOptimal') {
  const out = generateIOptimal(f, state.methodParams.iOptimalModel, state.methodParams.iOptimalRuns);
  runs = out.runs;
  state.iOptimalTrace = out.trace;
}
```

For all other method branches, set `state.iOptimalTrace = null` either at the
top of the dispatcher (before the if/else) or in each non-I-Optimal branch.
Doing it once at the top is simpler and DRY.

### HTML

In the `.plot-summary` block (lines ~3605-3622), add a new `.summary-stat` cell
between the `Total cells` cell and the `Method` cell, with id `stat-variance` and
class `summary-stat-iOptimal` so it can be selectively hidden:

```html
<div class="summary-stat summary-stat-iOptimal">
  <span class="summary-label">Avg. variance</span>
  <span class="summary-value" id="stat-variance">—</span>
</div>
```

### CSS

Hide the new cell by default; `updateExperimentDisplays` toggles a class to show it:

```css
.summary-stat-iOptimal { display: none; }
.plot-summary.show-variance .summary-stat-iOptimal { display: flex; }
```

(Existing `.summary-stat` is `display: flex` per the rest of the file. The toggle
class lives on the parent `.plot-summary` so a future second I-Optimal-only stat
could share it.)

### `updateExperimentDisplays`

Add lookup of the new cell and the parent row, then in the body:

```js
const statVariance   = document.getElementById('stat-variance');
const plotSummary    = document.querySelector('.plot-summary');

// inside the !state.results early-return: also clear/hide variance
if (!state.results) {
  [statRuns, statRepeats, statCells, statMethod, statVariance].forEach(el => {
    if (el) el.textContent = '—';
  });
  if (plotSummary) plotSummary.classList.remove('show-variance');
  if (resultsSummary) resultsSummary.textContent = '';
  return;
}

// after setting the other stats:
if (state.method === 'iOptimal' && state.iOptimalTrace !== null) {
  if (statVariance) statVariance.textContent = fmt(state.iOptimalTrace);
  if (plotSummary)  plotSummary.classList.add('show-variance');
} else {
  if (statVariance) statVariance.textContent = '—';
  if (plotSummary)  plotSummary.classList.remove('show-variance');
}
```

## Edge cases

- **Method changes without a new generation:** the binding rule is "summary row
  reflects the most recently generated design." This already applies to the
  existing `Method` cell — the radio-change handler at lines ~2167-2173 updates
  `state.method` but does not call `updateExperimentDisplays`. Avg. variance
  follows the same convention: it shows the trace from the last I-Optimal generate
  and only updates when the user clicks Generate again. No new event wiring needed.

- **`fmt` of an extremely small trace** (e.g. 1e-9): `fmt` already handles this with
  4 sig figs. Acceptable; no special-case formatting.

- **Failure path:** if `generateIOptimal` throws (singular start, infeasible run
  count), control never reaches `state.iOptimalTrace = out.trace`. The
  `state.iOptimalTrace = null` reset at the top of the dispatcher ensures the
  cell stays hidden when the user re-clicks Generate after fixing the input.

## Testing

Manual smoke test only (the project has no automated test suite). After changes:

1. Open `doe-designer.html` in a browser.
2. Counts mode, defaults, click **Latin Hypercube** → Generate → confirm
   summary row shows 4 cells, no Avg. variance.
3. Switch to **I-Optimal**, accept defaults → Generate → confirm 5 cells,
   Avg. variance shows a positive number formatted to 4 sig figs.
4. Switch back to **LHS** without regenerating → Generate → confirm cell hides.
5. Switch to I-Optimal, set N below `p` to trigger validation error → confirm
   no stale variance is shown after the error.
6. With I-Optimal active and results visible, edit a factor count to invalidate
   results → confirm `#results` hides and the variance cell along with it.

## Files touched

- `doe-designer.html` only. Five edits:
  1. CSS rule for `.summary-stat-iOptimal` (1-2 lines).
  2. HTML stat cell `#stat-variance` in `.plot-summary` (5 lines).
  3. `generateIOptimal` return shape — return `{ runs, trace }` instead of `runs`.
  4. `validateAndGenerate` dispatcher — reset `state.iOptimalTrace = null` at top,
     destructure `trace` and `runs` in the I-Optimal branch.
  5. `updateExperimentDisplays` — read `#stat-variance` and `.plot-summary`,
     toggle `show-variance` class, render `fmt(state.iOptimalTrace)` when
     I-Optimal results are present.
