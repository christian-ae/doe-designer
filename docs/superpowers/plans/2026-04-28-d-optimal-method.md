# D-Optimal DoE Method Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth DoE method, **D-Optimal Design**, available only in Counts and Exact-values modes. The user picks a model form (main effects, or main + 2-factor interactions) and a target run count `N`; the algorithm uses Fedorov exchange to choose the `N` candidates that maximise `|X'X|` of the model matrix.

**Architecture:** Single-file HTML app, all changes in `doe-designer.html`. Pure JavaScript implementation — no external dependencies. Helpers added in this order: a small Gauss-Jordan determinant/inverse utility, candidate-set + active-factor builders, model-matrix encoder, single-restart Fedorov exchange, and a `generateDOptimal` wrapper that runs five random restarts and keeps the best. Output rows match the existing Full Factorial schema, so all existing display surfaces (table, plots, parcoords, CSV) work without modification.

**Tech Stack:** Vanilla JS (ES6+), HTML, CSS, Plotly. No test framework — verification is manual (browser + Node DevTools console snippets).

**Spec:** [docs/superpowers/specs/2026-04-28-d-optimal-design.md](../specs/2026-04-28-d-optimal-design.md)

---

## File Structure

All changes are in [doe-designer.html](../../../doe-designer.html). Per-section line ranges (current file, will shift as tasks land):

- **State** (lines ~30–48): add `dOptimalModel` and `dOptimalRuns` to `methodParams`
- **Math + sampler helpers** (around lines 230–470): new `detAndInverse`, `buildCandidateSet`, `getActiveFactorIndices`, `encodeAsModelMatrix`, `fedorovExchange`, `generateDOptimal`
- **Validation** (`validateInputs` around line 370): add D-Optimal branch with hard errors and soft warnings
- **Generate dispatch** (around line 519): add a fourth `else if`
- **Display labels** (`methodShort` / `methodLong` around line 566): add D-Optimal entries
- **Method availability** (`getValidMethodsForMode` from the Range PR): add `dOptimal` to counts/values
- **Init / event wiring** (`init` around line 1227): live updates for model-form radio, run-count input, candidate-count badge
- **HTML** (method options around line 2310): add new D-Optimal `<div class="method-option">`
- **CSS** (style block around line 1944): add `.model-form-group` styling

Each task below produces one focused commit.

---

## Task 1: Add D-Optimal state scaffolding

**Files:**
- Modify: `doe-designer.html` (state literal around line 30–48)

- [ ] **Step 1: Add `dOptimalModel` and `dOptimalRuns` to `methodParams`**

Find:

```js
  method: 'lhs',
  methodParams: {
    samples:                20,
    orthogonalSubdivisions: 2,
  },
```

Replace with:

```js
  method: 'lhs',
  methodParams: {
    samples:                20,
    orthogonalSubdivisions: 2,
    dOptimalModel:          'main2fi',  // 'main' | 'main2fi'
    dOptimalRuns:           17,         // user-editable; default = ceil(1.5 * paramCount)
  },
```

- [ ] **Step 2: Verify state shape in DevTools**

Open `doe-designer.html` in a browser. Console:

```js
state.methodParams.dOptimalModel    // 'main2fi'
state.methodParams.dOptimalRuns     // 17
```

Expected: both fields present. Existing fields unchanged. Page renders normally — no behavioural change yet.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add D-Optimal state scaffolding

Two new methodParams fields: dOptimalModel ('main' or 'main2fi')
and dOptimalRuns (target run count). Defaults seeded so the user
can hit Generate immediately once the method is wired up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add D-Optimal method radio + extras panel HTML

**Files:**
- Modify: `doe-designer.html` (method options around line 2310, after the Orthogonal Sampling option)

- [ ] **Step 1: Insert the new method-option block**

Find the closing `</div>` of the Orthogonal Sampling method block. The relevant section ends with:

```html
          <p class="method-extra-hint">
            A stricter LHS variant: partitions the factor space into M<sup>n</sup> equally-probable subspaces (M subdivisions per each <em>varying</em> factor) and picks exactly one sample per subspace, while keeping each factor's values used evenly (the Latin hypercube property). Gives more uniform coverage than plain LHS — every subregion of the space is sampled with the same density. Run count is fixed at M<sup>n</sup>, where n is the number of factors you've set to more than one level (factors left at a single value are held constant and don't count toward n).
          </p>
        </div>
      </div>
    </div>
```

Immediately **before** the final two `</div>` lines that close the Orthogonal block (i.e. between the closing `</div>` of `extra-orthogonal` and the closing `</div>` of the section), insert a new `<div class="method-option">` for D-Optimal. The cleanest find/replace target is to add the new block between the closing `</div>` of `extra-orthogonal`'s wrapper `.method-option` and the section-wrapping `</div>`. Find:

```html
        <div class="method-extra hidden" id="extra-orthogonal">
          <div class="method-param-row">
            <label for="input-orthogonal-subdivisions">Subdivisions per factor (M)</label>
            <input type="number" id="input-orthogonal-subdivisions" class="param-input" value="2" min="2" max="5" step="1" />
          </div>
          <p class="method-result-badge">
            Total runs: <strong id="orthogonal-sample-count">16</strong>
            &nbsp;·&nbsp; <span id="orthogonal-sample-hint" style="font-weight:normal">M⁴ = 2⁴ = 16</span>
          </p>
          <p class="method-extra-hint">
            A stricter LHS variant: partitions the factor space into M<sup>n</sup> equally-probable subspaces (M subdivisions per each <em>varying</em> factor) and picks exactly one sample per subspace, while keeping each factor's values used evenly (the Latin hypercube property). Gives more uniform coverage than plain LHS — every subregion of the space is sampled with the same density. Run count is fixed at M<sup>n</sup>, where n is the number of factors you've set to more than one level (factors left at a single value are held constant and don't count toward n).
          </p>
        </div>
      </div>
    </div>
```

Replace with:

```html
        <div class="method-extra hidden" id="extra-orthogonal">
          <div class="method-param-row">
            <label for="input-orthogonal-subdivisions">Subdivisions per factor (M)</label>
            <input type="number" id="input-orthogonal-subdivisions" class="param-input" value="2" min="2" max="5" step="1" />
          </div>
          <p class="method-result-badge">
            Total runs: <strong id="orthogonal-sample-count">16</strong>
            &nbsp;·&nbsp; <span id="orthogonal-sample-hint" style="font-weight:normal">M⁴ = 2⁴ = 16</span>
          </p>
          <p class="method-extra-hint">
            A stricter LHS variant: partitions the factor space into M<sup>n</sup> equally-probable subspaces (M subdivisions per each <em>varying</em> factor) and picks exactly one sample per subspace, while keeping each factor's values used evenly (the Latin hypercube property). Gives more uniform coverage than plain LHS — every subregion of the space is sampled with the same density. Run count is fixed at M<sup>n</sup>, where n is the number of factors you've set to more than one level (factors left at a single value are held constant and don't count toward n).
          </p>
        </div>
      </div>

      <div class="method-option">
        <label class="method-label">
          <input type="radio" name="doe-method" id="radio-dOptimal" value="dOptimal" />
          D-Optimal Design
        </label>
        <p class="method-disabled-hint">Available in Level counts and Exact values modes.</p>
        <div class="method-extra hidden" id="extra-dOptimal">
          <div class="method-param-row">
            <label>Model form</label>
            <div class="model-form-group">
              <label><input type="radio" name="doptimal-model" value="main" /> Main effects only</label>
              <label><input type="radio" name="doptimal-model" value="main2fi" checked /> Main effects + 2-factor interactions</label>
            </div>
          </div>
          <div class="method-param-row">
            <label for="input-doptimal-runs">Number of runs</label>
            <input type="number" id="input-doptimal-runs" class="param-input" value="17" min="1" step="1" />
          </div>
          <p class="method-result-badge">
            Candidate points: <strong id="doptimal-candidate-count">—</strong>
            &nbsp;·&nbsp; Parameters: <strong id="doptimal-param-count">11</strong>
            &nbsp;·&nbsp; Min runs: <strong id="doptimal-min-runs">11</strong>
          </p>
          <p class="method-extra-hint">
            Algorithmically constructs a design that maximises |X'X| of the model matrix — useful when run count is fixed or the design space is irregular. Uses Fedorov exchange with 5 random restarts. Each Generate gives a fresh design.
          </p>
        </div>
      </div>
    </div>
```

(The change inserts a new `<div class="method-option">` block between the closing `</div>` of the Orthogonal option and the closing `</div>` of the section.)

- [ ] **Step 2: Verify the panel renders**

Reload the page. The D-Optimal radio appears as a fourth option below Orthogonal Sampling. Because the `applyMethodAvailability()` function from the Range PR will mark it `.method-disabled` until the dispatch sees it as valid (counts/values modes), the disabled hint already shows. Click the radio — nothing happens because Range mode is the default and `disabled` is set. Switch to Counts mode (which still triggers `applyMethodAvailability`); D-Optimal radio remains disabled because Task 4 hasn't yet added it to the valid list for counts.

This is expected: Task 2 only adds the HTML. Behavior wires up in Tasks 4 and 12.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add D-Optimal method radio and extras panel

Adds the fourth method option with model-form radio, run-count
input, and live info badge (candidate points, parameters, min
runs). Disabled by default — wired up in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add CSS for `.model-form-group`

**Files:**
- Modify: `doe-designer.html` (style block — find existing `.method-param-row` rule and add new rules nearby)

- [ ] **Step 1: Find the existing `.method-param-row` rule**

Search the `<style>` block for `.method-param-row`. It should look like:

```css
.method-param-row {
  display: flex;
  align-items: center;
  gap: 8px;
  /* ... possibly more declarations ... */
}
```

(If the rule isn't there in this exact form, find any rule that matches `.method-param-row` and add the new rules immediately after it.)

- [ ] **Step 2: Insert `.model-form-group` styling immediately after `.method-param-row`**

After the `.method-param-row` rule's closing `}`, insert:

```css
.model-form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.model-form-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  font-weight: 400;
}
.model-form-group input[type="radio"] {
  margin: 0;
}
```

- [ ] **Step 3: Verify visual styling**

Reload. Click the D-Optimal radio (still disabled — but the panel can be temporarily shown via DevTools for visual check):

```js
document.getElementById('extra-dOptimal').classList.remove('hidden');
```

The model-form radios stack vertically, each on its own line with the radio button left-aligned, label text right of it. Restore:

```js
document.getElementById('extra-dOptimal').classList.add('hidden');
```

- [ ] **Step 4: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Style D-Optimal model-form radio group

Stacks the two model-form radios vertically with consistent
spacing and font-size matching other panel hints.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update `getValidMethodsForMode` for D-Optimal

**Files:**
- Modify: `doe-designer.html` (`getValidMethodsForMode` function from the Range PR)

- [ ] **Step 1: Update the helper to include `dOptimal` in counts/values modes**

Find:

```js
/** Methods enabled in each input mode. */
function getValidMethodsForMode(mode) {
  return mode === 'range' ? ['lhs', 'orthogonal'] : ['fullFactorial'];
}
```

Replace with:

```js
/** Methods enabled in each input mode. */
function getValidMethodsForMode(mode) {
  return mode === 'range' ? ['lhs', 'orthogonal'] : ['fullFactorial', 'dOptimal'];
}
```

- [ ] **Step 2: Verify availability flips correctly**

Reload. Range mode is default. D-Optimal card greyed out with hint. Switch to **Level counts** mode. Expected:
- Full Factorial radio enabled and auto-selected (existing behaviour)
- D-Optimal radio enabled (newly enabled by this task), hint hidden, click-to-select works
- LHS, Orthogonal greyed out

In DevTools after clicking D-Optimal in counts mode:

```js
state.method;                    // 'dOptimal'
document.getElementById('extra-dOptimal').classList.contains('hidden');  // false
```

Switch back to Range mode: D-Optimal radio greys out again, auto-reselects to LHS.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Enable D-Optimal in counts and values modes

getValidMethodsForMode now lists D-Optimal alongside Full
Factorial in non-Range modes. The method radio becomes
selectable; the existing applyMethodAvailability flow handles
disable/enable styling.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add Gauss-Jordan determinant + inverse helper

**Files:**
- Modify: `doe-designer.html` (insert near the existing samplers, just before the `// ── Validation ─────` comment block around line 470)

- [ ] **Step 1: Insert the helper**

Find the comment line (`// ── Validation ─────────────────────────────────────────────────────────────`). Just **above** that line, insert:

```js
// ── D-Optimal helpers ──────────────────────────────────────────────────────

/**
 * Compute determinant and inverse of a small square matrix using Gauss-Jordan
 * elimination with partial pivoting. Returns { det, inv } where inv is null
 * and det is 0 if the matrix is singular (or near-singular within 1e-12).
 *
 * Sized for the small p × p (X'X) matrices used in D-Optimal (p ≤ 22 in this
 * project). For these sizes, Gauss-Jordan is fast (~30 µs at p=11) and clearer
 * than separate LU + back-substitution code.
 */
function detAndInverse(A) {
  const n = A.length;
  const M = A.map((row, i) => {
    const aug = row.slice();
    for (let j = 0; j < n; j++) aug.push(i === j ? 1 : 0);
    return aug;
  });
  let det = 1;
  for (let k = 0; k < n; k++) {
    let maxAbs = Math.abs(M[k][k]);
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(M[i][k]) > maxAbs) { maxAbs = Math.abs(M[i][k]); maxRow = i; }
    }
    if (maxRow !== k) {
      [M[k], M[maxRow]] = [M[maxRow], M[k]];
      det = -det;
    }
    const pivot = M[k][k];
    if (Math.abs(pivot) < 1e-12) return { det: 0, inv: null };
    det *= pivot;
    for (let j = 0; j < 2 * n; j++) M[k][j] /= pivot;
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const factor = M[i][k];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[i][j] -= factor * M[k][j];
    }
  }
  const inv = M.map(row => row.slice(n));
  return { det, inv };
}
```

- [ ] **Step 2: Verify with Node-runnable assertions**

Save this snippet to a temp file and run via Node, OR paste directly into the browser DevTools console after reload:

```js
// Identity 3x3 → det=1, inv=I
const I3 = [[1,0,0],[0,1,0],[0,0,1]];
const r1 = detAndInverse(I3);
console.assert(Math.abs(r1.det - 1) < 1e-9, 'identity det');
console.assert(Math.abs(r1.inv[0][0] - 1) < 1e-9 && Math.abs(r1.inv[0][1]) < 1e-9, 'identity inv');

// Diagonal [2, 3] → det=6, inv=diag(0.5, 1/3)
const D = [[2,0],[0,3]];
const r2 = detAndInverse(D);
console.assert(Math.abs(r2.det - 6) < 1e-9, 'diag det');
console.assert(Math.abs(r2.inv[0][0] - 0.5) < 1e-9, 'diag inv [0][0]');
console.assert(Math.abs(r2.inv[1][1] - 1/3) < 1e-9, 'diag inv [1][1]');

// 2x2 known: A=[[4,3],[6,3]], det = 4*3 - 3*6 = -6, inv = (1/-6)*[[3,-3],[-6,4]] = [[-0.5, 0.5],[1, -2/3]]
const A = [[4,3],[6,3]];
const r3 = detAndInverse(A);
console.assert(Math.abs(r3.det - -6) < 1e-9, '2x2 det');
console.assert(Math.abs(r3.inv[0][0] - -0.5) < 1e-9, '2x2 inv [0][0]');
console.assert(Math.abs(r3.inv[1][0] - 1) < 1e-9, '2x2 inv [1][0]');

// Singular (rank-deficient) → det=0, inv=null
const S = [[1,2],[2,4]];
const r4 = detAndInverse(S);
console.assert(r4.det === 0 && r4.inv === null, 'singular detection');

// Verify A · A^-1 == I for a random-ish 4x4
const B = [[2, 1, 0, 1], [0, 3, 0, 2], [1, 0, 4, 0], [0, 1, 0, 5]];
const r5 = detAndInverse(B);
const matMul = (X, Y) => {
  const m = X.length, n = Y[0].length, k = Y.length;
  const out = Array.from({length: m}, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let l = 0; l < k; l++)
      for (let j = 0; j < n; j++)
        out[i][j] += X[i][l] * Y[l][j];
  return out;
};
const prod = matMul(B, r5.inv);
for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
  const expected = i === j ? 1 : 0;
  console.assert(Math.abs(prod[i][j] - expected) < 1e-9, `B B^-1 [${i}][${j}] = ${prod[i][j]}`);
}

console.log('detAndInverse: all checks passed ✓');
```

Expected output: `detAndInverse: all checks passed ✓` (no assertion failures in console).

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add Gauss-Jordan determinant + inverse helper

Pure-JS detAndInverse(A) returns determinant and inverse of a
small square matrix via Gauss-Jordan with partial pivoting.
Singular matrices return { det: 0, inv: null }. Used by the
D-Optimal Fedorov exchange to evaluate |X'X| and the
quadratic-form leverages d_ii, d_jj, d_ij.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add candidate-set + active-factor helpers

**Files:**
- Modify: `doe-designer.html` (immediately after `detAndInverse` from Task 5)

- [ ] **Step 1: Insert `getActiveFactorIndices` and `buildCandidateSet`**

Immediately after the closing `}` of `detAndInverse` (added in Task 5), insert:

```js
/**
 * Returns the indices (into the canonical 4-factor list) of factors that have
 * more than one level / value / combination — i.e. the factors that contribute
 * meaningfully to the model. Held-constant factors are excluded.
 *
 * Canonical order: [temperature, chargeLoad, dischargeLoad, termination].
 */
function getActiveFactorIndices(factors) {
  const lengths = [
    factors.temperature.values.length,
    factors.chargeLoad.values.length,
    factors.dischargeLoad.values.length,
    factors.termination.combinations.length,
  ];
  const active = [];
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] > 1) active.push(i);
  }
  return active;
}

/**
 * Build the Cartesian-product candidate set of all factor values. Each entry
 * is a partial run object with the same shape that generateFullFactorial
 * produces (so downstream display code works unchanged).
 *
 * For values mode, each entry includes both the raw `termCombo` object and
 * the 1-indexed `termComboIndex`. Counts mode just uses level integers.
 */
function buildCandidateSet(factors) {
  const temps = factors.temperature.values;
  const cls   = factors.chargeLoad.values;
  const dls   = factors.dischargeLoad.values;
  const tcs   = factors.termination.combinations;
  const out = [];
  for (const t of temps) {
    for (const cl of cls) {
      for (const dl of dls) {
        for (let ti = 0; ti < tcs.length; ti++) {
          out.push({
            temperature:    t,
            chargeLoad:     cl,
            dischargeLoad:  dl,
            termCombo:      tcs[ti],
            termComboIndex: ti + 1,
          });
        }
      }
    }
  }
  return out;
}
```

- [ ] **Step 2: Verify with DevTools after reload**

```js
// Default counts mode: 3, 3, 3, 2 levels → state.factors.*.values
// (After mode toggle to counts and a Generate, the state syncs.)
setInputMode('counts');
syncStateFromDOM();
const C = buildCandidateSet(state.factors);
console.assert(C.length === 54, `candidate count: expected 54, got ${C.length}`);
console.assert(C[0].temperature === 1 && C[0].chargeLoad === 1, 'first row');
console.assert(C[53].termComboIndex === 2, 'last row term');
console.log('buildCandidateSet (counts default 3*3*3*2=54): ✓');

const active = getActiveFactorIndices(state.factors);
console.assert(active.length === 4 && active.join(',') === '0,1,2,3', `active indices: ${active}`);
console.log('getActiveFactorIndices (all 4 active): ✓');

// Pin termination to 1 combination → drops to 3 active factors
const before = state.factors.termination.combinations;
state.factors.termination.combinations = [before[0]];
const active2 = getActiveFactorIndices(state.factors);
console.assert(active2.join(',') === '0,1,2', `pinned termination active: ${active2}`);
state.factors.termination.combinations = before;
console.log('getActiveFactorIndices (3 active when termination held constant): ✓');
```

Expected: three `✓` lines.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add candidate-set and active-factor helpers

buildCandidateSet enumerates the Cartesian product of all factor
values, returning partial run objects in the same shape as
generateFullFactorial. getActiveFactorIndices returns the indices
of factors with more than one level — held-constant factors are
excluded so they don't add zero-variance columns to the model
matrix.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add `encodeAsModelMatrix` helper

**Files:**
- Modify: `doe-designer.html` (immediately after `buildCandidateSet` from Task 6)

- [ ] **Step 1: Insert the encoder**

Immediately after the closing `}` of `buildCandidateSet`, insert:

```js
/**
 * Encode a candidate row as one row of the model matrix used by D-Optimal.
 *
 * Numeric and ordinal-treated factors are min/max scaled to [-1, 1]:
 *   coded = 2 * (raw - min) / (max - min) - 1
 *
 * The termination factor is treated as numeric ordinal: its raw value is
 * `termComboIndex` (1..L). Held-constant factors (only one level) contribute
 * no column — their coded value would be 0 across all candidates.
 *
 * Returns a function that maps a candidate row to its encoded model-matrix
 * row vector. The function captures the per-factor min/max so it doesn't
 * recompute them per candidate.
 */
function makeRowEncoder(factors, modelForm, activeIdxs) {
  const lists = [
    factors.temperature.values,
    factors.chargeLoad.values,
    factors.dischargeLoad.values,
    factors.termination.combinations.map((_, i) => i + 1),  // 1..L
  ];
  const rawAccessors = [
    r => r.temperature,
    r => r.chargeLoad,
    r => r.dischargeLoad,
    r => r.termComboIndex,
  ];
  const ranges = lists.map(l => {
    const lo = Math.min(...l);
    const hi = Math.max(...l);
    return { lo, hi };
  });
  const code = (raw, idx) => {
    const { lo, hi } = ranges[idx];
    if (hi === lo) return 0;  // held constant — caller should skip this column
    return 2 * (raw - lo) / (hi - lo) - 1;
  };

  return function encodeRow(candidate) {
    const codedActive = activeIdxs.map(idx => code(rawAccessors[idx](candidate), idx));
    const row = [1];  // intercept
    for (const v of codedActive) row.push(v);
    if (modelForm === 'main2fi') {
      for (let i = 0; i < codedActive.length; i++) {
        for (let j = i + 1; j < codedActive.length; j++) {
          row.push(codedActive[i] * codedActive[j]);
        }
      }
    }
    return row;
  };
}

/**
 * Encode every candidate as a row of the model matrix. Returns an array of
 * arrays, sized |C| × p. p = 1 + activeCount  for 'main',
 *                       1 + activeCount + C(activeCount, 2)  for 'main2fi'.
 */
function encodeAsModelMatrix(candidates, factors, modelForm, activeIdxs) {
  const encodeRow = makeRowEncoder(factors, modelForm, activeIdxs);
  return candidates.map(encodeRow);
}

/** Number of model parameters for the given config. */
function dOptimalParamCount(modelForm, activeCount) {
  const base = 1 + activeCount;
  if (modelForm !== 'main2fi') return base;
  return base + (activeCount * (activeCount - 1)) / 2;
}
```

- [ ] **Step 2: Verify with DevTools**

```js
setInputMode('counts');
syncStateFromDOM();
const C = buildCandidateSet(state.factors);
const active = getActiveFactorIndices(state.factors);
console.assert(active.length === 4, 'all 4 active');

// Main effects only: p = 5
const Mmain = encodeAsModelMatrix(C, state.factors, 'main', active);
console.assert(Mmain.length === 54, `M length: ${Mmain.length}`);
console.assert(Mmain[0].length === 5, `main p: ${Mmain[0].length}`);
console.assert(Mmain[0][0] === 1, 'intercept');
// First candidate: temp=1 (min) → coded = -1; charge=1 → -1; discharge=1 → -1; term=1 → -1
console.assert(Mmain[0].slice(1).every(v => v === -1), 'first row coded all -1');
console.log('encodeAsModelMatrix main: 54 rows × 5 cols, first row [-1,-1,-1,-1] ✓');

// Main + 2FI: p = 1 + 4 + C(4,2) = 11
const M2fi = encodeAsModelMatrix(C, state.factors, 'main2fi', active);
console.assert(M2fi[0].length === 11, `main2fi p: ${M2fi[0].length}`);
// Interactions of first row (all -1s): each pair product = (-1)*(-1) = 1
const interactions = M2fi[0].slice(5);
console.assert(interactions.every(v => v === 1), `first row interactions: ${interactions}`);
console.log('encodeAsModelMatrix main2fi: 54 rows × 11 cols, first-row interactions all 1 ✓');

// Param count helper
console.assert(dOptimalParamCount('main',    4) === 5,  'main 4');
console.assert(dOptimalParamCount('main2fi', 4) === 11, 'main2fi 4');
console.assert(dOptimalParamCount('main',    3) === 4,  'main 3');
console.assert(dOptimalParamCount('main2fi', 3) === 7,  'main2fi 3');
console.log('dOptimalParamCount: ✓');
```

Expected: three `✓` lines.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add D-Optimal model-matrix encoder

makeRowEncoder builds a per-config closure that scales each
factor to [-1, 1] using min/max coding and assembles either
main-effects or main+2FI rows. encodeAsModelMatrix maps the
closure across the candidate set to produce the full |C| × p
matrix. dOptimalParamCount returns p for validation and badge
display.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add Fedorov exchange (single-restart)

**Files:**
- Modify: `doe-designer.html` (immediately after `dOptimalParamCount` from Task 7)

- [ ] **Step 1: Insert `fedorovExchange`**

Immediately after the closing `}` of `dOptimalParamCount`, insert:

```js
/**
 * Single-restart Fedorov exchange. Starts from a random distinct subset of
 * candidate indices, then repeatedly swaps one current row out for a
 * non-included candidate that maximises the Δ-criterion until no positive Δ
 * is found.
 *
 * Returns { design, det } — the chosen indices and the final |X'X|. Returns
 * { design: null, det: 0 } if every starting subset is singular.
 *
 * The Δ-criterion (closed form, derived from the rank-1 update of (X'X)):
 *   Δ_ij = (1 + d_jj) * (1 - d_ii) + d_ij^2 - 1
 * where d_ii = x_i' M^-1 x_i, d_jj = x_j' M^-1 x_j, d_ij = x_i' M^-1 x_j,
 * and M = X'X for the current design. A swap improves |X'X| iff Δ > 0.
 */
function fedorovExchange(candidatesM, N) {
  const C = candidatesM.length;
  const p = candidatesM[0].length;
  const MAX_ITER         = 100;
  const MAX_SINGULAR     = 20;
  const EPS              = 1e-9;
  const SINGULAR_DET_EPS = 1e-12;

  // Helper: pick N distinct random indices in [0, C)
  function pickRandomIndices() {
    const all = Array.from({ length: C }, (_, i) => i);
    fisherYates(all);
    return all.slice(0, N);
  }

  // Helper: matMul X' X where X is an N × p row-major array
  function gramian(X) {
    const G = Array.from({ length: p }, () => new Array(p).fill(0));
    for (const row of X) {
      for (let i = 0; i < p; i++) {
        const ri = row[i];
        for (let j = 0; j < p; j++) {
          G[i][j] += ri * row[j];
        }
      }
    }
    return G;
  }

  // Helper: x' M^-1 y  for vectors x, y and p × p matrix M^-1
  function bilinear(x, Minv, y) {
    let s = 0;
    for (let i = 0; i < p; i++) {
      let row = 0;
      for (let k = 0; k < p; k++) row += Minv[i][k] * y[k];
      s += x[i] * row;
    }
    return s;
  }

  let attempts = 0;
  while (attempts < MAX_SINGULAR) {
    const design = pickRandomIndices();
    let X = design.map(i => candidatesM[i]);
    let { det, inv } = detAndInverse(gramian(X));
    if (Math.abs(det) < SINGULAR_DET_EPS || inv === null) { attempts++; continue; }

    for (let iter = 0; iter < MAX_ITER; iter++) {
      let bestDelta = EPS;
      let bestI = -1, bestJ = -1;

      const inDesign = new Set(design);
      for (let i = 0; i < N; i++) {
        const xi = X[i];
        const d_ii = bilinear(xi, inv, xi);
        for (let j = 0; j < C; j++) {
          if (inDesign.has(j)) continue;
          const xj = candidatesM[j];
          const d_jj = bilinear(xj, inv, xj);
          const d_ij = bilinear(xi, inv, xj);
          const delta = (1 + d_jj) * (1 - d_ii) + d_ij * d_ij - 1;
          if (delta > bestDelta) {
            bestDelta = delta;
            bestI = i;
            bestJ = j;
          }
        }
      }

      if (bestI === -1) break;  // converged
      design[bestI] = bestJ;
      X[bestI] = candidatesM[bestJ];
      const next = detAndInverse(gramian(X));
      if (Math.abs(next.det) < SINGULAR_DET_EPS || next.inv === null) {
        // Should not happen since Δ>0 implies non-singular, but guard anyway
        return { design: design.slice(), det };
      }
      det = next.det;
      inv = next.inv;
    }
    return { design: design.slice(), det };
  }

  return { design: null, det: 0 };
}
```

- [ ] **Step 2: Verify with DevTools**

```js
// Use a small synthetic candidate matrix to keep verification deterministic-ish.
// 4 factors, 2 levels each → 16 candidates. Code each factor to ±1.
const synthCands = [];
for (let a = 0; a < 2; a++)
  for (let b = 0; b < 2; b++)
    for (let c = 0; c < 2; c++)
      for (let d = 0; d < 2; d++) {
        const row = [1, a*2-1, b*2-1, c*2-1, d*2-1];  // intercept + 4 main effects
        synthCands.push(row);
      }
console.assert(synthCands.length === 16, '16 cands');

// Run Fedorov for N=8, p=5
const r = fedorovExchange(synthCands, 8);
console.assert(r.design !== null, 'non-null design');
console.assert(r.design.length === 8, `design size: ${r.design.length}`);
const distinct = new Set(r.design).size;
console.assert(distinct === 8, `distinct: ${distinct}`);
console.assert(r.det > 0, `det > 0: ${r.det}`);

// For the synthetic 2^4 case with main-effects model, the optimal half-fraction
// gives a saturated D-optimal design with |X'X| = 8^5 = 32768
console.assert(r.det >= 32000, `near-optimal det: got ${r.det}, expect ~32768`);
console.log(`Fedorov 2^4 main-effects, N=8: det=${r.det.toFixed(0)} (optimal=32768) ✓`);
```

Expected: `Fedorov 2^4 main-effects, N=8: det=32768 ✓` (or very close — Fedorov should hit the optimum on this small problem).

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add Fedorov exchange (single restart)

fedorovExchange picks N distinct candidate indices at random,
then iteratively swaps the row whose removal-and-replacement
gives the largest positive Δ in |X'X|. Stops when no swap
improves the criterion (max 100 iterations defensive cap).
Re-rolls if the random start is singular; gives up after 20
consecutive singular starts. Returns the chosen indices and
final determinant.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Add `generateDOptimal` entry function

**Files:**
- Modify: `doe-designer.html` (immediately after `fedorovExchange` from Task 8)

- [ ] **Step 1: Insert the wrapper that runs five restarts and assembles the run output**

Immediately after the closing `}` of `fedorovExchange`, insert:

```js
/**
 * D-Optimal Design entry point. Runs five Fedorov-exchange restarts and
 * keeps the design with the largest |X'X|. Output rows match the existing
 * Full Factorial schema so renderTable / renderParCoords / downloadCSV /
 * computePlotAxis all work without modification.
 *
 * Throws an Error if every restart hits a singular start — caller should
 * surface this as a validation-style error.
 */
function generateDOptimal(factors, modelForm, N) {
  const NUM_RESTARTS = 5;

  const activeIdxs = getActiveFactorIndices(factors);
  if (activeIdxs.length === 0) {
    throw new Error('D-Optimal: at least one factor must have more than one level.');
  }
  const C = buildCandidateSet(factors);
  if (N > C.length) {
    throw new Error(`D-Optimal: requested ${N} runs exceeds the ${C.length} candidate points; D-Optimal cannot pick more rows than exist in the Cartesian product of the factor values.`);
  }
  const p = dOptimalParamCount(modelForm, activeIdxs.length);
  if (N < p) {
    throw new Error(`D-Optimal: number of runs (N=${N}) must be ≥ N model parameters (p=${p}).`);
  }

  const M = encodeAsModelMatrix(C, factors, modelForm, activeIdxs);

  let bestDesign = null;
  let bestDet    = -Infinity;
  for (let r = 0; r < NUM_RESTARTS; r++) {
    const result = fedorovExchange(M, N);
    if (result.design !== null && result.det > bestDet) {
      bestDesign = result.design;
      bestDet    = result.det;
    }
  }
  if (bestDesign === null) {
    throw new Error('D-Optimal: could not find a non-singular starting design — try increasing run count or reducing model complexity.');
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

- [ ] **Step 2: Verify with DevTools**

```js
setInputMode('counts');
syncStateFromDOM();
const runs = generateDOptimal(state.factors, 'main2fi', 17);
console.assert(runs.length === 17, `count: ${runs.length}`);
console.assert(runs[0].run === 1 && runs[16].run === 17, 'run numbers');
const fingerprints = new Set(runs.map(r =>
  `${r.temperature}|${r.chargeLoad}|${r.dischargeLoad}|${r.termComboIndex}`
));
console.assert(fingerprints.size === 17, `distinct rows: ${fingerprints.size}`);
console.log(`generateDOptimal main2fi N=17: produced 17 distinct runs ✓`);

// Main-only with smaller N
const runs2 = generateDOptimal(state.factors, 'main', 8);
console.assert(runs2.length === 8, `count: ${runs2.length}`);
console.log(`generateDOptimal main N=8: produced 8 runs ✓`);

// Error: N too small
let threw = false;
try { generateDOptimal(state.factors, 'main2fi', 5); }
catch (e) { threw = true; console.log(`expected error: ${e.message}`); }
console.assert(threw, 'should throw on N < p');

// Error: N too large
threw = false;
try { generateDOptimal(state.factors, 'main', 100); }
catch (e) { threw = true; console.log(`expected error: ${e.message}`); }
console.assert(threw, 'should throw on N > candidate count');
```

Expected: 17 distinct runs, 8 runs, two thrown error messages with sensible text.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add generateDOptimal entry function

Wraps fedorovExchange with five random restarts (keeping the
design with the largest |X'X|) and shapes the output to match
generateFullFactorial. Performs upfront validation for N < p,
N > candidate count, and zero active factors — these throw
Error so the caller can surface them in the validation UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire generate dispatch

**Files:**
- Modify: `doe-designer.html` (`runGeneration` / generate dispatch around line 519, modified during the Range PR)

- [ ] **Step 1: Add the fourth `else if` branch**

Find:

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
  } else {
    runs = isRange
      ? generateOrthogonalContinuous(f, state.methodParams.orthogonalSubdivisions)
      : generateOrthogonal(f, state.methodParams.orthogonalSubdivisions);
  }
```

Replace with:

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
  } else if (state.method === 'dOptimal') {
    runs = generateDOptimal(f, state.methodParams.dOptimalModel, state.methodParams.dOptimalRuns);
  }
```

- [ ] **Step 2: Verify generate works end-to-end**

Reload. Switch to **Counts** mode, click **D-Optimal Design** radio. With default settings (model=main2fi, runs=17), click **Generate**. Expected:
- Results table appears with 17 rows
- Columns: Run, Temperature, Charge Load, Discharge Load, Termination (the existing counts-mode 5-column layout)
- Values are level integers (1, 2, 3 for temp/loads; 1 or 2 for termination)
- Each row is a distinct combination
- 3D plot, 2D plot, parcoords all render

Click **Generate** again — a fresh design appears (different rows; D-Optimal uses random restarts).

DevTools spot check:

```js
state.results.length;                          // 17
new Set(state.results.map(r =>
  `${r.temperature}|${r.chargeLoad}|${r.dischargeLoad}|${r.termComboIndex}`
)).size;                                       // 17 — all distinct
```

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Dispatch to generateDOptimal in counts/values modes

runGeneration now routes the dOptimal method to its generator.
D-Optimal runs in counts and values modes only; the existing
mode-method gating (applyMethodAvailability) prevents this
branch from firing in Range mode.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Add D-Optimal validation branch

**Files:**
- Modify: `doe-designer.html` (`validateInputs` function, after the existing orthogonal validation block around line 460)

- [ ] **Step 1: Insert the D-Optimal validation block**

Find the existing closing of the `state.method === 'orthogonal'` block, which immediately precedes the `state.method === 'fullFactorial'` block:

```js
      } else if (N > 500) {
        warnings.push(
          `Orthogonal Sampling: this configuration will produce ${N.toLocaleString()} runs.`
        );
      }
    }
  }

  if (state.method === 'fullFactorial') {
```

Replace with:

```js
      } else if (N > 500) {
        warnings.push(
          `Orthogonal Sampling: this configuration will produce ${N.toLocaleString()} runs.`
        );
      }
    }
  }

  if (state.method === 'dOptimal') {
    const N = state.methodParams.dOptimalRuns;
    if (!Number.isInteger(N) || N < 1) {
      errors.push('D-Optimal: number of runs must be a positive integer.');
    } else {
      const activeIdxs = getActiveFactorIndices(f);
      if (activeIdxs.length === 0) {
        errors.push('D-Optimal: at least one factor must have more than one level.');
      } else {
        const p = dOptimalParamCount(state.methodParams.dOptimalModel, activeIdxs.length);
        if (N < p) {
          errors.push(
            `D-Optimal: number of runs (N=${N}) must be ≥ N model parameters (p=${p}) — increase runs or switch to a smaller model.`
          );
        }
        const candidateCount =
          f.temperature.values.length *
          f.chargeLoad.values.length *
          f.dischargeLoad.values.length *
          f.termination.combinations.length;
        if (N > candidateCount) {
          errors.push(
            `D-Optimal: requested ${N} runs exceeds the ${candidateCount.toLocaleString()} candidate points; D-Optimal cannot pick more rows than exist in the Cartesian product of the factor values.`
          );
        } else if (candidateCount > 0 && N > 0.5 * candidateCount) {
          warnings.push(
            `D-Optimal: requested >50% of the candidate points (${N}/${candidateCount.toLocaleString()}) — at this density the design approaches full factorial. Consider reducing N or using Full Factorial.`
          );
        }
        if (N > 100) {
          warnings.push(
            `D-Optimal: ${N} runs is large — consider whether a screening design (LHS in Range mode) would suit better.`
          );
        }
      }
    }
  }

  if (state.method === 'fullFactorial') {
```

- [ ] **Step 2: Verify validation fires correctly**

Reload, switch to **Counts** mode, click **D-Optimal Design**. Default settings should pass validation:

```js
state.method === 'dOptimal';                   // true
syncStateFromDOM();
validateInputs().errors;                       // []
```

Now manually edit `Number of runs` to `5` (below p=11 for main+2FI). Click anywhere to blur, then:

```js
state.methodParams.dOptimalRuns = 5;
validateInputs().errors;
// ["D-Optimal: number of runs (N=5) must be ≥ N model parameters (p=11) — increase runs or switch to a smaller model."]
```

Set runs to `100` (exceeds 54 candidates):

```js
state.methodParams.dOptimalRuns = 100;
validateInputs().errors;
// includes "D-Optimal: requested 100 runs exceeds the 54 candidate points..."
```

Set runs to `30` (>50% of 54 candidates):

```js
state.methodParams.dOptimalRuns = 30;
const v = validateInputs();
v.errors;       // []
v.warnings;     // includes ">50% of the candidate points"
```

Set all temperatures to a single level (active count = 3):

```js
state.factors.temperature.values = [1];
validateInputs();   // p drops to 1+3+3=7, candidate count drops; new validation fires
```

(restore state by reloading after these tests.)

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add D-Optimal validation

Hard errors for: non-integer / non-positive N; zero active
factors; N < p; N > candidate count. Soft warnings for: N
above 50% of the candidate set (full factorial would be
simpler) and N above 100 (large; consider LHS instead).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Wire live UI updates for D-Optimal panel

**Files:**
- Modify: `doe-designer.html` (`init` function around line 1227, plus a new `updateDOptimalBadge` helper)

- [ ] **Step 1: Add `updateDOptimalBadge` near the other badge updaters**

Find `updateOrthogonalBadge` (the function added in the Range PR, around line 1198). Just **after** the closing `}` of `updateOrthogonalBadge`, insert:

```js
/**
 * Recompute and display the D-Optimal info badge: candidate-set size,
 * parameter count, and minimum runs. Reads the active-factor count from
 * whichever input mode is active, mirroring updateOrthogonalBadge's
 * mode-aware reads.
 */
function updateDOptimalBadge() {
  const cEl   = document.getElementById('doptimal-candidate-count');
  const pEl   = document.getElementById('doptimal-param-count');
  const minEl = document.getElementById('doptimal-min-runs');
  if (!cEl || !pEl || !minEl) return;

  // Sync first so we read the current values
  if (state.inputMode === 'counts' || state.inputMode === 'values') {
    syncStateFromDOM();
  }

  const f = state.factors;
  const candidateCount =
    Math.max(f.temperature.values.length, 1) *
    Math.max(f.chargeLoad.values.length, 1) *
    Math.max(f.dischargeLoad.values.length, 1) *
    Math.max(f.termination.combinations.length, 1);
  const activeIdxs = getActiveFactorIndices(f);
  const p = dOptimalParamCount(state.methodParams.dOptimalModel, activeIdxs.length);

  cEl.textContent   = candidateCount.toLocaleString();
  pEl.textContent   = p.toString();
  minEl.textContent = p.toString();
}
```

- [ ] **Step 2: Track manual edits to the run-count input + add live wiring in `init`**

Inside the `init` function, find the existing **LHS samples** wiring (around line 1255):

```js
  // LHS samples
  document.getElementById('input-lhs-samples').addEventListener('input', e => {
    state.methodParams.samples = parseInt(e.target.value, 10);
  });
```

Immediately **after** that block, insert:

```js
  // D-Optimal — track whether the user has manually edited the run-count input,
  // so model-form switches only auto-update the field if it's still at default.
  let userEditedDOptimalRuns = false;
  const dOptimalRunsEl = document.getElementById('input-doptimal-runs');
  if (dOptimalRunsEl) {
    dOptimalRunsEl.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      state.methodParams.dOptimalRuns = Number.isInteger(v) ? v : 1;
      userEditedDOptimalRuns = true;
    });
  }

  // D-Optimal model-form radios
  document.querySelectorAll('input[name="doptimal-model"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.methodParams.dOptimalModel = radio.value;
      updateDOptimalBadge();
      // Auto-recompute the run-count default if user hasn't manually edited
      if (!userEditedDOptimalRuns && dOptimalRunsEl) {
        const activeIdxs = getActiveFactorIndices(state.factors);
        const p = dOptimalParamCount(radio.value, activeIdxs.length);
        const newDefault = Math.ceil(1.5 * p);
        state.methodParams.dOptimalRuns = newDefault;
        dOptimalRunsEl.value = newDefault;
      }
    });
  });

  // Run an initial badge update so the panel shows correct numbers when first opened
  updateDOptimalBadge();
```

- [ ] **Step 3: Hook the panel-input observer to also refresh the D-Optimal badge**

Find the existing line in `init` that wires the panel-wide input observer to `updateOrthogonalBadge`:

```js
  // The "total runs" badge depends on both M and on how many factors vary.
  // Refresh it whenever any input in the left panel changes, or when combo
  // rows are added/removed.
  const panel = document.querySelector('.panel');
  if (panel) panel.addEventListener('input', updateOrthogonalBadge);
  const comboList = document.getElementById('term-combo-list');
  if (comboList) {
    new MutationObserver(updateOrthogonalBadge).observe(comboList, { childList: true });
  }
```

Replace with:

```js
  // The "total runs" badge depends on both M and on how many factors vary.
  // Refresh it (and the D-Optimal badge) whenever any input in the left panel
  // changes, or when combo rows are added/removed.
  const panel = document.querySelector('.panel');
  if (panel) panel.addEventListener('input', () => {
    updateOrthogonalBadge();
    updateDOptimalBadge();
  });
  const comboList = document.getElementById('term-combo-list');
  if (comboList) {
    new MutationObserver(() => {
      updateOrthogonalBadge();
      updateDOptimalBadge();
    }).observe(comboList, { childList: true });
  }
```

- [ ] **Step 4: Verify live updates**

Reload. Switch to **Counts** mode, select **D-Optimal Design**. Expected initial badge: `Candidate points: 54 · Parameters: 11 · Min runs: 11`. Run-count input shows `17`.

Click **Main effects only** radio. Expected:
- Parameters: 5
- Min runs: 5
- Run count auto-updates to `8` (= ceil(1.5 × 5))
- `state.methodParams.dOptimalRuns === 8` and `state.methodParams.dOptimalModel === 'main'`

Click **Main effects + 2-factor interactions**. Expected: parameters back to 11, min runs 11, run count back to 17.

Manually type `12` in the run-count input. Click main-only radio. Expected:
- Parameters: 5
- Min runs: 5
- Run count **stays at `12`** (user has manually edited; flag prevents auto-reset)
- `state.methodParams.dOptimalRuns === 12`

Now change Temperature levels from 3 to 5 (in counts mode):

```js
document.getElementById('input-temp-count').value = '5';
document.getElementById('input-temp-count').dispatchEvent(new Event('input', { bubbles: true }));
```

Expected: Candidate points jumps to 5×3×3×2 = 90. Parameters/Min runs unchanged (still 5 active factors).

- [ ] **Step 5: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Wire live updates for D-Optimal panel

Model-form radios, run-count input, and panel input observer
all push fresh values to state and refresh the D-Optimal badge
(candidate points, parameters, min runs). Switching the model
form auto-recomputes the run-count default unless the user has
manually edited the input.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Add D-Optimal entries to display label maps

**Files:**
- Modify: `doe-designer.html` (`methodShort` and `methodLong` maps in `updateExperimentDisplays` around line 566–573)

- [ ] **Step 1: Update `methodShort` and `methodLong`**

Find:

```js
  const methodShort = {
    fullFactorial: 'Full Factorial',
    lhs:           'Latin Hypercube',
    orthogonal:    `Orthogonal M=${state.methodParams.orthogonalSubdivisions}`,
  };
  const methodLong = {
    fullFactorial: 'Full Factorial',
    lhs:           'Latin Hypercube Sampling',
    orthogonal:    `Orthogonal Sampling (M=${state.methodParams.orthogonalSubdivisions})`,
  };
```

Replace with:

```js
  const modelFormShort = mf => mf === 'main2fi' ? 'main+2FI' : 'main';
  const modelFormLong  = mf => mf === 'main2fi' ? 'main effects + 2-factor interactions' : 'main effects only';
  const dM = state.methodParams.dOptimalModel;
  const dN = state.methodParams.dOptimalRuns;
  const methodShort = {
    fullFactorial: 'Full Factorial',
    lhs:           'Latin Hypercube',
    orthogonal:    `Orthogonal M=${state.methodParams.orthogonalSubdivisions}`,
    dOptimal:      `D-Optimal ${modelFormShort(dM)}, N=${dN}`,
  };
  const methodLong = {
    fullFactorial: 'Full Factorial',
    lhs:           'Latin Hypercube Sampling',
    orthogonal:    `Orthogonal Sampling (M=${state.methodParams.orthogonalSubdivisions})`,
    dOptimal:      `D-Optimal Design (${modelFormLong(dM)}, N=${dN})`,
  };
```

- [ ] **Step 2: Verify labels appear in results**

Reload, switch to Counts mode, select D-Optimal, click Generate. Expected: results header shows `"17 runs · 17 cells · D-Optimal Design (main effects + 2-factor interactions, N=17)"`.

Switch model to "Main effects only", click Generate again. Header now shows `"8 runs · 8 cells · D-Optimal Design (main effects only, N=8)"`.

The legend / experiment-stats card uses `methodShort`, e.g. `"D-Optimal main, N=8"`.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add D-Optimal entries to method label maps

methodShort/methodLong gain dOptimal entries that include the
chosen model form and run count. Helpers translate the model
enum to readable strings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Final smoke verification

**Files:** none — verification only.

- [ ] **Step 1: Reload and exercise the full feature flow in a browser**

After all preceding tasks have been committed:

1. Reload the page. Default lands on Range mode + LHS — verify D-Optimal radio is greyed out with the hint "Available in Level counts and Exact values modes."
2. Click **Level counts**. D-Optimal becomes selectable. Click **D-Optimal Design**. Default badges: 54 candidates, 11 parameters, 11 min runs. Run count: 17.
3. Click **Generate**. Results table shows 17 distinct rows with the existing counts-mode 5-column layout. 3D plot, 2D plot, parallel coordinates all render.
4. Click **Generate** again. A fresh design appears (different combination of 17 rows).
5. Click **Main effects only**. Run count auto-updates to 8. **Generate** — 8-row design. Header shows `"D-Optimal Design (main effects only, N=8)"`.
6. Switch to **Exact values** mode. Enter values: Temperature `5,25,45`, Charge Load `1,3`, Discharge Load `2,4`, add 3 termination combinations. Pick D-Optimal main+2FI, runs auto-default to `ceil(1.5 × 11) = 17`. Click **Generate**. Results show real numeric values; CSV download has the existing 8-column values schema.
7. Set Temperature to a single value (`25`) → active count drops to 3, params drop to 7 (main+2FI: 1+3+3 = 7), min runs becomes 7. Run count badge updates accordingly.
8. Switch to **Range** mode. D-Optimal greys out and the hint reappears. LHS auto-selected.
9. Switch back to **Level counts**. D-Optimal still selected (or auto-selects when applicable per the existing apply logic).

- [ ] **Step 2: DevTools sanity checks**

```js
// In counts mode after a Generate:
state.results.length === state.methodParams.dOptimalRuns;   // true
new Set(state.results.map(r =>
  `${r.temperature}|${r.chargeLoad}|${r.dischargeLoad}|${r.termComboIndex}`
)).size === state.results.length;                            // true (all distinct)

// Repeats: set repeats to 3 manually in the UI, click Generate
state.repeats === 3;                                         // true after edit
state.results.length === 17;                                 // results array still 17
// experiment-stats card should show "51 cells" (= 17 × 3)
```

- [ ] **Step 3: No commit needed** (pure verification task).

If everything passes, the feature is done. If anything fails, fix in place and commit a follow-up.

---

## Self-Review Notes

**Spec coverage verified:**

- Method placement, mode availability, UI panel — Tasks 2, 3, 4
- State shape — Task 1
- Mode-method coupling — Task 4 (extends `getValidMethodsForMode`); the existing `applyMethodAvailability` flow handles the rest unchanged
- Model matrix encoding (numeric `[-1, 1]` coding, drop held-constant columns, ordinal termination) — Task 7
- Fedorov exchange algorithm — Task 8 (single restart) + Task 9 (multi-restart wrapper)
- Pure-JS LU/Gauss-Jordan helper — Task 5
- Generate dispatch — Task 10
- Validation (hard errors + soft warnings) — Task 11
- Live UI updates — Task 12
- Display labels — Task 13
- Output schema (matches Full Factorial) — implicit in Task 9; verified in Task 14
- Run output → existing display surfaces work unchanged — verified in Task 14

**Naming consistency:** `dOptimalModel`, `dOptimalRuns`, `getActiveFactorIndices`, `buildCandidateSet`, `encodeAsModelMatrix`, `dOptimalParamCount`, `fedorovExchange`, `generateDOptimal`, `detAndInverse`, `updateDOptimalBadge`, `userEditedDOptimalRuns` are used consistently between definition and call sites.

**ID consistency:** input element IDs follow the pattern `input-doptimal-*` and badge IDs follow `doptimal-*-count` / `doptimal-*-runs`:
- HTML (Task 2): `radio-dOptimal`, `extra-dOptimal`, `input-doptimal-runs`, `doptimal-candidate-count`, `doptimal-param-count`, `doptimal-min-runs`, plus `name="doptimal-model"` on the model-form radios
- Live updates (Task 12): all referenced consistently

**Edge cases handled:**
- All factors held constant → `getActiveFactorIndices` returns `[]` → validation error (Task 11) and `generateDOptimal` throw (Task 9)
- N < p → validation error
- N > candidate count → validation error
- N > 0.5 × candidate count → soft warning
- N > 100 → soft warning about screening alternatives
- Singular initial design → re-rolled up to 20 times (Task 8); throws clear error if all 20 fail (Task 9)
- Manual run-count edit + model switch → auto-default disabled by `userEditedDOptimalRuns` flag (Task 12)
- Mode toggle Range → counts/values → D-Optimal becomes available; existing `applyMethodAvailability` handles the styling
