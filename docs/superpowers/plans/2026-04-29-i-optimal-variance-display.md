# I-Optimal Avg. Variance Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the I-optimal design's average prediction variance (the I-criterion = `trace((X'X)^-1 · W)`) as a new stat cell in the experiment-summary row, visible only when method = I-Optimal and a design has been generated.

**Architecture:** Plumb `bestTrace` out of `generateIOptimal` via a new return shape `{ runs, trace }`. Store it on a sibling `state.iOptimalTrace` field (leaving `state.results` as a plain `Run[]` to avoid touching every consumer). Add one `.summary-stat` cell in the `.plot-summary` row, hidden by default via CSS; `updateExperimentDisplays` toggles a `show-variance` class on the parent and renders the value with `fmt()`.

**Tech Stack:** Single-file vanilla JS app (`doe-designer.html`). No build, no test framework. Verification is manual smoke testing in a browser, supplemented by inline `console.assert` checks during development.

---

## File Structure

All edits are in **`doe-designer.html`** (single file). No new files.

Touch points (current line numbers, will drift slightly during edits):
- **CSS** — `.plot-summary`/`.summary-stat` rules at ~3083-3127. Add `.summary-stat-iOptimal` + `.show-variance` rules.
- **HTML** — `.plot-summary` block at ~3605-3622. Insert one new `.summary-stat` cell.
- **State init** — global `state` object (~line 30-50). Add `iOptimalTrace: null`.
- **`generateIOptimal`** at ~875-915. Change return value.
- **Dispatcher** in `validateAndGenerate` at ~1173-1190. Reset state at top, destructure I-Optimal branch.
- **`updateExperimentDisplays`** at ~1210-1254. Read new cell, toggle class, render value.

---

## Task 1: Plumb trace through generateIOptimal and the dispatcher

**Files:**
- Modify: `doe-designer.html` — `state` initial object (~line 30-50)
- Modify: `doe-designer.html:907-914` (generateIOptimal return)
- Modify: `doe-designer.html:1173-1190` (validateAndGenerate dispatcher)

- [ ] **Step 1: Locate the global state object**

Run a grep to confirm the line:

```
Grep pattern: "^const state\s*=|^let state\s*=" path: doe-designer.html
```

Expected: one match defining `const state = { … }` near the top of the script.

- [ ] **Step 2: Add `iOptimalTrace: null` to state init**

Open the state object. After whatever last field exists (likely `results: null` or `methodParams`), add a new line:

```js
iOptimalTrace: null,  // populated by generateIOptimal; null otherwise
```

The exact location: alongside the other top-level state fields, NOT inside `methodParams`. If `state.results` exists, place `iOptimalTrace` immediately after it for readability.

- [ ] **Step 3: Change `generateIOptimal` return shape**

In `doe-designer.html` find this block at the end of `generateIOptimal` (around line 907-914):

```js
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

Replace with:

```js
  const runs = bestDesign.map((idx, i) => ({
    run:            i + 1,
    temperature:    C[idx].temperature,
    chargeLoad:     C[idx].chargeLoad,
    dischargeLoad:  C[idx].dischargeLoad,
    termCombo:      C[idx].termCombo,
    termComboIndex: C[idx].termComboIndex,
  }));
  return { runs, trace: bestTrace };
}
```

- [ ] **Step 4: Update the JSDoc above `generateIOptimal`**

Find the JSDoc at lines 866-874:

```js
/**
 * I-Optimal Design entry point. Runs five Fedorov-exchange restarts and
 * keeps the design with the smallest trace((X'X)^-1 · W). Output rows match
 * the existing Full Factorial schema so renderTable / renderParCoords /
 * downloadCSV / computePlotAxis all work without modification.
 *
 * Throws an Error if every restart hits a singular start — caller should
 * surface this as a validation-style error.
 */
```

Replace with:

```js
/**
 * I-Optimal Design entry point. Runs five Fedorov-exchange restarts and
 * keeps the design with the smallest trace((X'X)^-1 · W).
 *
 * Returns { runs, trace }:
 *   - runs:  Array of run objects matching the Full Factorial schema, so
 *            renderTable / renderParCoords / downloadCSV / computePlotAxis
 *            work without modification.
 *   - trace: Final I-criterion value = trace((X'X)^-1 · W) for the chosen
 *            design. Used to surface the average prediction variance in the
 *            summary row.
 *
 * Throws an Error if every restart hits a singular start — caller should
 * surface this as a validation-style error.
 */
```

- [ ] **Step 5: Update the dispatcher in `validateAndGenerate`**

Find the dispatcher block at lines 1173-1190:

```js
  const f = state.factors;
  const isRange = state.inputMode === 'range';
  let runs;
  if (state.method === 'fullFactorial') {
    runs = generateFullFactorial(f);
  } else if (state.method === 'lhs') {
    runs = isRange
      ? generateLHSContinuous(f, state.methodParams.samples)
      : generateLHS(f, state.methodParams.samples);
  } else if (state.method === 'orthogonal') {
    runs = isRange
      ? generateOrthogonalContinuous(f, state.methodParams.orthogonalSubdivisions)
      : generateOrthogonal(f, state.methodParams.orthogonalSubdivisions);
  } else if (state.method === 'iOptimal') {
    runs = generateIOptimal(f, state.methodParams.iOptimalModel, state.methodParams.iOptimalRuns);
  }

  state.results        = runs;
  state.highlightedRun = null;
```

Replace with:

```js
  const f = state.factors;
  const isRange = state.inputMode === 'range';
  let runs;
  state.iOptimalTrace = null;
  if (state.method === 'fullFactorial') {
    runs = generateFullFactorial(f);
  } else if (state.method === 'lhs') {
    runs = isRange
      ? generateLHSContinuous(f, state.methodParams.samples)
      : generateLHS(f, state.methodParams.samples);
  } else if (state.method === 'orthogonal') {
    runs = isRange
      ? generateOrthogonalContinuous(f, state.methodParams.orthogonalSubdivisions)
      : generateOrthogonal(f, state.methodParams.orthogonalSubdivisions);
  } else if (state.method === 'iOptimal') {
    const out = generateIOptimal(f, state.methodParams.iOptimalModel, state.methodParams.iOptimalRuns);
    runs = out.runs;
    state.iOptimalTrace = out.trace;
  }

  state.results        = runs;
  state.highlightedRun = null;
```

The `state.iOptimalTrace = null;` line BEFORE the if/else ensures every non-I-Optimal generate clears any stale value.

- [ ] **Step 6: Console-verify the plumbing**

Open `doe-designer.html` in a browser. Open DevTools console. In the UI:
- Counts mode (default), defaults
- Click the I-Optimal radio
- Click Generate

Then in the console run:

```js
state.iOptimalTrace
```

Expected: a finite positive number (typically between ~0.5 and ~5 for the default factor configuration with main-effects model). Should NOT be `null` or `undefined`.

Then switch the method radio to LHS, click Generate, and check again:

```js
state.iOptimalTrace
```

Expected: `null`.

- [ ] **Step 7: Commit**

```bash
git add doe-designer.html
git commit -m "Plumb I-optimal trace through generateIOptimal and dispatcher

Return shape changed from Run[] to { runs, trace }. Trace stored on
state.iOptimalTrace, reset to null at the top of every dispatcher run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add HTML stat cell and CSS hide/show rule

**Files:**
- Modify: `doe-designer.html:3083-3127` (CSS block)
- Modify: `doe-designer.html:3605-3622` (HTML stats row)

- [ ] **Step 1: Add the CSS rule**

Find the existing CSS block ending at:

```css
.summary-stat.accent-green .summary-value { color: var(--green); }
```

(around line 3127)

Immediately after that line, add:

```css
.summary-stat-iOptimal { display: none; }
.plot-summary.show-variance .summary-stat-iOptimal { display: flex; }
```

- [ ] **Step 2: Insert the new HTML cell**

Find this block at lines 3605-3622:

```html
        <div class="plot-summary">
          <div class="summary-stat">
            <span class="summary-label">Runs</span>
            <span class="summary-value" id="stat-runs">—</span>
          </div>
          <div class="summary-stat">
            <span class="summary-label">Repeats</span>
            <span class="summary-value" id="stat-repeats">—</span>
          </div>
          <div class="summary-stat accent-green">
            <span class="summary-label">Total cells</span>
            <span class="summary-value" id="stat-cells">—</span>
          </div>
          <div class="summary-stat">
            <span class="summary-label">Method</span>
            <span class="summary-value summary-value-text" id="stat-method">—</span>
          </div>
        </div>
```

Insert a new cell BETWEEN the `Total cells` block and the `Method` block, so it becomes:

```html
        <div class="plot-summary">
          <div class="summary-stat">
            <span class="summary-label">Runs</span>
            <span class="summary-value" id="stat-runs">—</span>
          </div>
          <div class="summary-stat">
            <span class="summary-label">Repeats</span>
            <span class="summary-value" id="stat-repeats">—</span>
          </div>
          <div class="summary-stat accent-green">
            <span class="summary-label">Total cells</span>
            <span class="summary-value" id="stat-cells">—</span>
          </div>
          <div class="summary-stat summary-stat-iOptimal">
            <span class="summary-label">Avg. variance</span>
            <span class="summary-value" id="stat-variance">—</span>
          </div>
          <div class="summary-stat">
            <span class="summary-label">Method</span>
            <span class="summary-value summary-value-text" id="stat-method">—</span>
          </div>
        </div>
```

- [ ] **Step 3: Visual-verify the cell is hidden by default**

Reload `doe-designer.html` in the browser. Ensure no I-Optimal results are shown yet (fresh load). In the UI:
- Counts mode (default), defaults
- LHS radio (default), Generate

Look at the summary row above the plots. Expected: 4 cells — Runs, Repeats, Total cells, Method. NO Avg. variance cell visible.

In DevTools, inspect the stats row. Confirm:

```html
<div class="summary-stat summary-stat-iOptimal">
  <span class="summary-label">Avg. variance</span>
  <span class="summary-value" id="stat-variance">—</span>
</div>
```

…exists in the DOM but its computed `display` is `none`.

- [ ] **Step 4: Commit**

```bash
git add doe-designer.html
git commit -m "Add hidden Avg. variance stat cell to summary row

CSS class .summary-stat-iOptimal hides the cell by default; a
.show-variance class on the parent .plot-summary will reveal it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire updateExperimentDisplays to render the variance

**Files:**
- Modify: `doe-designer.html:1210-1254` (`updateExperimentDisplays`)

- [ ] **Step 1: Update element lookups and the no-results branch**

Find the start of `updateExperimentDisplays` (~line 1210):

```js
function updateExperimentDisplays() {
  const statRuns       = document.getElementById('stat-runs');
  const statRepeats    = document.getElementById('stat-repeats');
  const statCells      = document.getElementById('stat-cells');
  const statMethod     = document.getElementById('stat-method');
  const resultsSummary = document.getElementById('results-summary');

  if (!state.results) {
    [statRuns, statRepeats, statCells, statMethod].forEach(el => {
      if (el) el.textContent = '—';
    });
    if (resultsSummary) resultsSummary.textContent = '';
    return;
  }
```

Replace with:

```js
function updateExperimentDisplays() {
  const statRuns       = document.getElementById('stat-runs');
  const statRepeats    = document.getElementById('stat-repeats');
  const statCells      = document.getElementById('stat-cells');
  const statVariance   = document.getElementById('stat-variance');
  const statMethod     = document.getElementById('stat-method');
  const plotSummary    = document.querySelector('.plot-summary');
  const resultsSummary = document.getElementById('results-summary');

  if (!state.results) {
    [statRuns, statRepeats, statCells, statVariance, statMethod].forEach(el => {
      if (el) el.textContent = '—';
    });
    if (plotSummary) plotSummary.classList.remove('show-variance');
    if (resultsSummary) resultsSummary.textContent = '';
    return;
  }
```

- [ ] **Step 2: Add the variance render at the end of the populated branch**

Find the populated branch in the same function (immediately after the existing `statRuns/statRepeats/statCells/statMethod` text-content assignments and the `resultsSummary` block, just before the closing `}` of the function):

```js
  if (statRuns)    statRuns.textContent    = nRuns;
  if (statRepeats) statRepeats.textContent = state.repeats;
  if (statCells)   statCells.textContent   = nCells;
  if (statMethod)  statMethod.textContent  = methodShort[state.method];

  if (resultsSummary) {
    resultsSummary.textContent =
      `${nRuns} run${nRuns !== 1 ? 's' : ''} · ${nCells} cell${nCells !== 1 ? 's' : ''} · ${methodLong[state.method]}`;
  }
}
```

Add a new block just before the closing `}`:

```js
  if (statRuns)    statRuns.textContent    = nRuns;
  if (statRepeats) statRepeats.textContent = state.repeats;
  if (statCells)   statCells.textContent   = nCells;
  if (statMethod)  statMethod.textContent  = methodShort[state.method];

  if (resultsSummary) {
    resultsSummary.textContent =
      `${nRuns} run${nRuns !== 1 ? 's' : ''} · ${nCells} cell${nCells !== 1 ? 's' : ''} · ${methodLong[state.method]}`;
  }

  if (state.method === 'iOptimal' && state.iOptimalTrace !== null) {
    if (statVariance) statVariance.textContent = fmt(state.iOptimalTrace);
    if (plotSummary)  plotSummary.classList.add('show-variance');
  } else {
    if (statVariance) statVariance.textContent = '—';
    if (plotSummary)  plotSummary.classList.remove('show-variance');
  }
}
```

- [ ] **Step 3: Smoke-test the full feature flow**

Reload `doe-designer.html` in the browser. Run through these steps in order:

**(a) LHS first — variance hidden:**
- Counts mode, defaults, LHS, Generate
- Expected: 4-cell summary row (Runs / Repeats / Total cells / Method). No Avg. variance cell visible.

**(b) Switch to I-Optimal:**
- Click I-Optimal radio
- Accept defaults, Generate
- Expected: 5-cell row appears with Avg. variance between Total cells and Method.
- Avg. variance shows a positive number formatted to 4 sig figs (e.g. `0.6250`, `1.234`).
- Method cell shows `I-Optimal main, N=8` (or whatever default applies).

**(c) Sanity-check the value:**
- Open DevTools console, run `state.iOptimalTrace`
- Expected: same number that appears in the cell (modulo `fmt()` 4-sig-fig rounding).

**(d) Switch back to LHS without regenerating:**
- Click the LHS radio
- Expected: stats row STILL shows the I-Optimal results (5 cells with variance). This is correct — the Method cell already exhibits this stale-until-regenerate behaviour, and variance follows the same convention.

**(e) Click Generate again with LHS active:**
- Expected: row collapses back to 4 cells. Avg. variance cell is hidden.

**(f) Validation-error path:**
- Click I-Optimal
- Set the I-Optimal run-count input to a value below `p` (e.g. 1)
- Click Generate
- Expected: validation error shown; no new design generated. Stats row still shows whatever was last successfully generated (LHS, 4 cells). NO Avg. variance cell shown.

**(g) Factor-edit invalidation:**
- I-Optimal, defaults, Generate (5-cell row appears).
- Edit a factor count (e.g. add a temperature value).
- Expected: results section hides (#results becomes hidden) and the variance cell hides with it.

If any of (a)-(g) fails, fix the issue and re-test before committing.

- [ ] **Step 4: Commit**

```bash
git add doe-designer.html
git commit -m "Render Avg. variance in summary row when method is I-Optimal

updateExperimentDisplays toggles the show-variance class on .plot-summary
and renders fmt(state.iOptimalTrace). For non-I-Optimal methods or empty
results the cell is reset and hidden.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Final verification and branch hygiene

**Files:** none (verification only).

- [ ] **Step 1: Re-run the full smoke matrix from Task 3 Step 3**

After all commits land, do one more end-to-end pass: (a) → (g) above. This catches any regressions introduced by combining the three commits.

- [ ] **Step 2: Verify no console errors**

With DevTools open during the smoke test, confirm there are no red errors or yellow warnings introduced by the new code. (Plotly may produce its own benign warnings — those are pre-existing and not regression signals.)

- [ ] **Step 3: Confirm git state**

```bash
git status
```

Expected: `working tree clean` on branch `i-optimal-method`.

```bash
git log --oneline -5
```

Expected: top 4 commits should be:
1. `Render Avg. variance in summary row when method is I-Optimal`
2. `Add hidden Avg. variance stat cell to summary row`
3. `Plumb I-optimal trace through generateIOptimal and dispatcher`
4. `Add design spec for I-Optimal Avg. variance display`

- [ ] **Step 4: Hand off to finishing-a-development-branch skill**

Once Task 4 verification passes, announce: "I'm using the finishing-a-development-branch skill to complete this work." and follow that skill to present completion options.
