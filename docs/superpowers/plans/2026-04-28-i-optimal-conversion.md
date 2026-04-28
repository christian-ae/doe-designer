# Convert D-Optimal to I-Optimal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing D-Optimal Design method with **I-Optimal Design** — same Fedorov-exchange machinery and candidate set, different optimisation criterion. I-optimal minimises `trace((X'X)^-1 · W)` where `W = (1/|C|) · M'M` is the moments matrix of the candidate set.

**Architecture:** Keep the criterion-agnostic helpers (Gauss-Jordan inverse, candidate-set builder, model-matrix encoder, Fedorov skeleton). Add a new `computeMomentsMatrix` helper, generalise `fedorovExchange` to take a criterion parameter (`'D'` or `'I'`) and a moments matrix (used for `'I'`), then do a mechanical rename pass that swaps every `dOptimal*` reference for `iOptimal*` and replaces the D-criterion call site with the I-criterion call. The rename has to land atomically because state, HTML IDs, and JS refs are tightly coupled.

**Tech Stack:** Vanilla JS (ES6+), HTML, CSS, Plotly. No test framework — verification is manual (browser + Node DevTools console snippets).

**Spec:** [docs/superpowers/specs/2026-04-28-i-optimal-conversion-design.md](../specs/2026-04-28-i-optimal-conversion-design.md)

---

## File Structure

All changes are in [doe-designer.html](../../../doe-designer.html). Affected regions:

- **Math helpers** (around lines 500–880): add `computeMomentsMatrix`; generalise `fedorovExchange`; rename and update `generateDOptimal` → `generateIOptimal` (adds W computation, criterion='I', trace comparison); rename `dOptimalParamCount` → `iOptimalParamCount`.
- **Validation** (`validateInputs`): rename branch + messages.
- **Generate dispatch**: rename branch.
- **Display labels** (`methodShort` / `methodLong`): rename keys + flip strings.
- **Method availability** (`getValidMethodsForMode`): rename value.
- **Init wiring** (`init` and the `userEdited*` flag): rename DOM IDs + flag.
- **Badge updater**: rename `updateDOptimalBadge` → `updateIOptimalBadge`.
- **HTML method-option card**: rename radio id/value, panel id, input ids, model-radio name, badge ids, label text, and hint paragraph.

Each task below produces one focused commit.

---

## Task 1: Add `computeMomentsMatrix` helper

**Files:**
- Modify: `doe-designer.html` — insert immediately after `dOptimalParamCount`, before `fedorovExchange`.

- [ ] **Step 1: Insert the helper**

Find:

```js
/** Number of model parameters for the given config. */
function dOptimalParamCount(modelForm, activeCount) {
  const base = 1 + activeCount;
  if (modelForm !== 'main2fi') return base;
  return base + (activeCount * (activeCount - 1)) / 2;
}
```

Immediately **after** the closing `}` of `dOptimalParamCount`, insert:

```js
/**
 * Build the moments matrix W = (1/|C|) · M' · M for the I-optimal criterion.
 * W is the candidate-set average of f(c)·f(c)' across the full candidate
 * model matrix M (|C| × p). Used as the discrete approximation of the
 * integrated prediction-variance integral.
 *
 * Returns a p × p symmetric positive-semidefinite matrix.
 */
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

- [ ] **Step 2: Verify with a Node-runnable snippet**

Save and run:

```bash
cat > /tmp/test-moments.js << 'EOF'
EOF
awk '/^function computeMomentsMatrix/,/^}/' doe-designer.html >> /tmp/test-moments.js
cat >> /tmp/test-moments.js << 'EOF'

// Sanity: identity columns → moments matrix should equal column-norm² / |C|
// 4 rows × 3 cols, columns are [1, 1, 1, 1], [1, -1, 1, -1], [1, 1, -1, -1]
const M = [
  [1,  1,  1],
  [1, -1,  1],
  [1,  1, -1],
  [1, -1, -1],
];
const W = computeMomentsMatrix(M);
// W[0][0] = (1²+1²+1²+1²)/4 = 1
// W[1][1] = (1+1+1+1)/4 = 1
// W[2][2] = (1+1+1+1)/4 = 1
// W[0][1] = (1·1 + 1·-1 + 1·1 + 1·-1)/4 = 0   (orthogonal)
// W[0][2] = (1·1 + 1·1 + 1·-1 + 1·-1)/4 = 0
// W[1][2] = (1·1 + -1·1 + 1·-1 + -1·-1)/4 = 0
console.assert(Math.abs(W[0][0] - 1) < 1e-9, `W[0][0]: ${W[0][0]}`);
console.assert(Math.abs(W[1][1] - 1) < 1e-9, `W[1][1]: ${W[1][1]}`);
console.assert(Math.abs(W[2][2] - 1) < 1e-9, `W[2][2]: ${W[2][2]}`);
console.assert(Math.abs(W[0][1]) < 1e-9, `W[0][1]: ${W[0][1]}`);
console.assert(Math.abs(W[0][2]) < 1e-9, `W[0][2]: ${W[0][2]}`);
console.assert(Math.abs(W[1][2]) < 1e-9, `W[1][2]: ${W[1][2]}`);
// Symmetry
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
  console.assert(Math.abs(W[i][j] - W[j][i]) < 1e-9, `symmetry at [${i}][${j}]`);
}
console.log('computeMomentsMatrix: orthogonal 3-col case → I (3×3) ✓');

// Asymmetric case: scale a column. Column 1 = [2, 2, 2, 2] (constant 2 instead of 1)
const M2 = [
  [2,  1],
  [2, -1],
  [2,  1],
  [2, -1],
];
const W2 = computeMomentsMatrix(M2);
// W2[0][0] = (2²+2²+2²+2²)/4 = 4
// W2[1][1] = 1
// W2[0][1] = (2·1 + 2·-1 + 2·1 + 2·-1)/4 = 0
console.assert(Math.abs(W2[0][0] - 4) < 1e-9, `W2 scaled diag`);
console.assert(Math.abs(W2[1][1] - 1) < 1e-9, `W2 unit diag`);
console.assert(Math.abs(W2[0][1]) < 1e-9, `W2 off-diag`);
console.log('computeMomentsMatrix: asymmetric scaling → diag(4, 1) ✓');
EOF
node /tmp/test-moments.js
```

Expected output:
```
computeMomentsMatrix: orthogonal 3-col case → I (3×3) ✓
computeMomentsMatrix: asymmetric scaling → diag(4, 1) ✓
```

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add computeMomentsMatrix helper for I-optimal

Returns the p × p candidate-set moments matrix W = (1/|C|) · M'M.
Used as the discrete approximation of the integrated
prediction-variance integral that underlies the I-optimal
criterion. Pure function, no side effects.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Generalise `fedorovExchange` to support `'D'` and `'I'` criteria

**Files:**
- Modify: `doe-designer.html` — replace the existing `fedorovExchange` body.

- [ ] **Step 1: Replace the function**

Find the existing function and replace it entirely:

```js
/**
 * Single-restart Fedorov exchange. Starts from a random distinct subset of
 * candidate indices, then repeatedly swaps one current row out for a
 * non-included candidate that improves the chosen criterion.
 *
 * - criterion 'D': maximises |X'X|.   Δ = (1+α_j)(1−α_i) + γ² − 1, want Δ > 0.
 * - criterion 'I': minimises trace((X'X)^-1 · W).
 *     Δ = η_i/(1−α_i) − v²/denom, want Δ < 0.
 *     v² = η_j + 2ρ·η_ij + ρ²·η_i,  ρ = γ/(1−α_i),
 *     denom = 1 + α_j + γ²/(1−α_i),
 *     η_i = x_i'·B·x_i, η_j = x_j'·B·x_j, η_ij = x_i'·B·x_j, B = A·W·A.
 *
 * W is required when criterion === 'I' (passed in from the caller, computed
 * once per Generate). Ignored when criterion === 'D'.
 *
 * Returns { design, det, trace }:
 *   - design: array of N candidate indices (or null on every-restart-singular)
 *   - det:    final |X'X| (always populated)
 *   - trace:  final trace((X'X)^-1 · W) (populated only for criterion 'I')
 */
function fedorovExchange(candidatesM, N, criterion = 'D', W = null) {
  const C = candidatesM.length;
  const p = candidatesM[0].length;
  const MAX_ITER         = 100;
  const MAX_SINGULAR     = 20;
  const EPS              = 1e-9;
  const SINGULAR_DET_EPS = 1e-12;

  function pickRandomIndices() {
    const all = Array.from({ length: C }, (_, i) => i);
    fisherYates(all);
    return all.slice(0, N);
  }

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

  // x' M y  for vectors x, y and p × p matrix M
  function bilinear(x, M, y) {
    let s = 0;
    for (let i = 0; i < p; i++) {
      let row = 0;
      for (let k = 0; k < p; k++) row += M[i][k] * y[k];
      s += x[i] * row;
    }
    return s;
  }

  // Compute B = A · W · A (only used for criterion 'I'). Returns p × p.
  function computeB(A, W) {
    // First AW = A · W (p × p)
    const AW = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < p; i++) {
      for (let k = 0; k < p; k++) {
        const aik = A[i][k];
        if (aik === 0) continue;
        for (let j = 0; j < p; j++) AW[i][j] += aik * W[k][j];
      }
    }
    // Then B = AW · A
    const B = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < p; i++) {
      for (let k = 0; k < p; k++) {
        const ak = AW[i][k];
        if (ak === 0) continue;
        for (let j = 0; j < p; j++) B[i][j] += ak * A[k][j];
      }
    }
    return B;
  }

  // trace(A · W) — used only for criterion 'I' to report the final value
  function traceProd(A, W) {
    let t = 0;
    for (let i = 0; i < p; i++) {
      let s = 0;
      for (let k = 0; k < p; k++) s += A[i][k] * W[k][i];
      t += s;
    }
    return t;
  }

  let attempts = 0;
  while (attempts < MAX_SINGULAR) {
    const design = pickRandomIndices();
    let X = design.map(i => candidatesM[i]);
    let { det, inv } = detAndInverse(gramian(X));
    if (Math.abs(det) < SINGULAR_DET_EPS || inv === null) { attempts++; continue; }

    for (let iter = 0; iter < MAX_ITER; iter++) {
      let bestDelta;
      let bestI = -1, bestJ = -1;

      const inDesign = new Set(design);

      if (criterion === 'D') {
        bestDelta = EPS;
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
      } else {
        // criterion === 'I'
        const B = computeB(inv, W);
        bestDelta = -EPS;
        for (let i = 0; i < N; i++) {
          const xi = X[i];
          const alpha_i = bilinear(xi, inv, xi);
          if (1 - alpha_i <= SINGULAR_DET_EPS) continue;  // would-be-singular swap
          const eta_i = bilinear(xi, B, xi);
          for (let j = 0; j < C; j++) {
            if (inDesign.has(j)) continue;
            const xj = candidatesM[j];
            const alpha_j = bilinear(xj, inv, xj);
            const gamma   = bilinear(xi, inv, xj);
            const eta_j   = bilinear(xj, B, xj);
            const eta_ij  = bilinear(xi, B, xj);
            const rho     = gamma / (1 - alpha_i);
            const v2      = eta_j + 2 * rho * eta_ij + rho * rho * eta_i;
            const denom   = 1 + alpha_j + (gamma * gamma) / (1 - alpha_i);
            const delta   = eta_i / (1 - alpha_i) - v2 / denom;
            if (delta < bestDelta) {
              bestDelta = delta;
              bestI = i;
              bestJ = j;
            }
          }
        }
      }

      if (bestI === -1) break;
      design[bestI] = bestJ;
      X[bestI] = candidatesM[bestJ];
      const next = detAndInverse(gramian(X));
      if (Math.abs(next.det) < SINGULAR_DET_EPS || next.inv === null) {
        // Defensive: a swap that should have been improvements somehow yielded singular.
        // Return what we have.
        const trace = (criterion === 'I' && next.inv !== null) ? traceProd(next.inv, W) : 0;
        return { design: design.slice(), det: next.det, trace };
      }
      det = next.det;
      inv = next.inv;
    }

    const trace = criterion === 'I' ? traceProd(inv, W) : 0;
    return { design: design.slice(), det, trace };
  }

  return { design: null, det: 0, trace: 0 };
}
```

- [ ] **Step 2: Verify both criteria still work via Node**

```bash
cat > /tmp/test-fedorov-both.js << 'EOF'
function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
EOF
for fn in detAndInverse computeMomentsMatrix fedorovExchange; do
  awk "/^function ${fn}/,/^}/" doe-designer.html >> /tmp/test-fedorov-both.js
  echo "" >> /tmp/test-fedorov-both.js
done
cat >> /tmp/test-fedorov-both.js << 'EOF'

// Synthetic 2^4 main-effects: 16 candidates, p=5
const synthCands = [];
for (let a = 0; a < 2; a++)
  for (let b = 0; b < 2; b++)
    for (let c = 0; c < 2; c++)
      for (let d = 0; d < 2; d++)
        synthCands.push([1, a*2-1, b*2-1, c*2-1, d*2-1]);

// W = (1/16) · M'M. Columns are orthogonal & balanced → W = I (5×5)
const W = computeMomentsMatrix(synthCands);
for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
  const expected = i === j ? 1 : 0;
  console.assert(Math.abs(W[i][j] - expected) < 1e-9, `W[${i}][${j}] = ${W[i][j]}`);
}
console.log('W for 2^4 main-effects: identity ✓');

// criterion 'D': should hit |X'X| = 8^5 = 32768 (existing behavior)
let bestDetD = 0;
for (let trial = 0; trial < 5; trial++) {
  const r = fedorovExchange(synthCands, 8, 'D');
  if (r.det > bestDetD) bestDetD = r.det;
}
console.assert(Math.abs(bestDetD - 32768) < 1, `D-opt 2^4 N=8: ${bestDetD} (expect 32768)`);
console.log(`Fedorov 'D' 2^4 N=8: |X'X| = ${bestDetD} ✓`);

// criterion 'I': for half-fraction X'X = 8I, (X'X)^-1 = (1/8)I,
// trace((X'X)^-1 · W) = trace((1/8) I) = 5/8 = 0.625
let bestTraceI = Infinity;
let detAtBestTrace = 0;
for (let trial = 0; trial < 5; trial++) {
  const r = fedorovExchange(synthCands, 8, 'I', W);
  if (r.trace < bestTraceI) { bestTraceI = r.trace; detAtBestTrace = r.det; }
}
console.assert(Math.abs(bestTraceI - 0.625) < 1e-6, `I-opt trace: ${bestTraceI} (expect 0.625)`);
console.assert(Math.abs(detAtBestTrace - 32768) < 1, `I-opt det at best trace: ${detAtBestTrace} (expect 32768)`);
console.log(`Fedorov 'I' 2^4 N=8: trace = ${bestTraceI}, det at optimum = ${detAtBestTrace} ✓`);
console.log(`Both criteria agree on the half-fraction (orthogonal design)`);
EOF
node /tmp/test-fedorov-both.js
```

Expected output:
```
W for 2^4 main-effects: identity ✓
Fedorov 'D' 2^4 N=8: |X'X| = 32768 ✓
Fedorov 'I' 2^4 N=8: trace = 0.625, det at optimum = 32768 ✓
Both criteria agree on the half-fraction (orthogonal design)
```

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Generalise fedorovExchange to support D and I criteria

Adds a criterion parameter ('D' default for backward compat, 'I'
for the new I-optimal path) and a moments matrix W (used by 'I').
The 'I' path computes B = A·W·A once per iteration, then evaluates
the closed-form rank-2 ΔI for each candidate swap. Returns
{ design, det, trace } — trace is the final |X'X| / I-criterion
value, populated only for criterion 'I'.

Existing callers (generateDOptimal) get default criterion='D' and
unchanged behavior.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Convert D-Optimal to I-Optimal (atomic rename + activate I-path)

This task touches state, HTML, helpers, validation, dispatch, labels, init wiring, and the hint text. It must land in one commit because the rename couples them tightly — landing partial renames would break the page.

**Files:**
- Modify: `doe-designer.html` (multiple regions detailed below).

- [ ] **Step 1: Rename state fields**

Find:

```js
    samples:                20,
    orthogonalSubdivisions: 2,
    dOptimalModel:          'main2fi',  // 'main' | 'main2fi'
    dOptimalRuns:           17,         // user-editable; default = ceil(1.5 * paramCount)
  },
```

Replace with:

```js
    samples:                20,
    orthogonalSubdivisions: 2,
    iOptimalModel:          'main2fi',  // 'main' | 'main2fi'
    iOptimalRuns:           17,         // user-editable; default = ceil(1.5 * paramCount)
  },
```

- [ ] **Step 2: Rename method radio + extras panel HTML**

Find:

```html
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
```

Replace with:

```html
      <div class="method-option">
        <label class="method-label">
          <input type="radio" name="doe-method" id="radio-iOptimal" value="iOptimal" />
          I-Optimal Design
        </label>
        <p class="method-disabled-hint">Available in Level counts and Exact values modes.</p>
        <div class="method-extra hidden" id="extra-iOptimal">
          <div class="method-param-row">
            <label>Model form</label>
            <div class="model-form-group">
              <label><input type="radio" name="ioptimal-model" value="main" /> Main effects only</label>
              <label><input type="radio" name="ioptimal-model" value="main2fi" checked /> Main effects + 2-factor interactions</label>
            </div>
          </div>
          <div class="method-param-row">
            <label for="input-ioptimal-runs">Number of runs</label>
            <input type="number" id="input-ioptimal-runs" class="param-input" value="17" min="1" step="1" />
          </div>
          <p class="method-result-badge">
            Candidate points: <strong id="ioptimal-candidate-count">—</strong>
            &nbsp;·&nbsp; Parameters: <strong id="ioptimal-param-count">11</strong>
            &nbsp;·&nbsp; Min runs: <strong id="ioptimal-min-runs">11</strong>
          </p>
          <p class="method-extra-hint">
            Algorithmically constructs a design that minimises the average prediction variance over the candidate region — useful when run count is fixed and you care most about how well the design predicts within the region of interest. Uses Fedorov exchange with 5 random restarts. Each Generate gives a fresh design.
          </p>
        </div>
      </div>
```

- [ ] **Step 3: Rename `dOptimalParamCount` → `iOptimalParamCount`**

Find:

```js
/** Number of model parameters for the given config. */
function dOptimalParamCount(modelForm, activeCount) {
  const base = 1 + activeCount;
  if (modelForm !== 'main2fi') return base;
  return base + (activeCount * (activeCount - 1)) / 2;
}
```

Replace with:

```js
/** Number of model parameters for the given config. */
function iOptimalParamCount(modelForm, activeCount) {
  const base = 1 + activeCount;
  if (modelForm !== 'main2fi') return base;
  return base + (activeCount * (activeCount - 1)) / 2;
}
```

- [ ] **Step 4: Replace `generateDOptimal` with `generateIOptimal`**

Find the entire `generateDOptimal` function (it starts with `function generateDOptimal(factors, modelForm, N) {` and ends with the closing `}` and a docstring blank line above):

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

Replace with:

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

- [ ] **Step 5: Rename `updateDOptimalBadge` → `updateIOptimalBadge`**

Find:

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

Replace with:

```js
/**
 * Recompute and display the I-Optimal info badge: candidate-set size,
 * parameter count, and minimum runs. Reads the active-factor count from
 * whichever input mode is active, mirroring updateOrthogonalBadge's
 * mode-aware reads.
 */
function updateIOptimalBadge() {
  const cEl   = document.getElementById('ioptimal-candidate-count');
  const pEl   = document.getElementById('ioptimal-param-count');
  const minEl = document.getElementById('ioptimal-min-runs');
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
  const p = iOptimalParamCount(state.methodParams.iOptimalModel, activeIdxs.length);

  cEl.textContent   = candidateCount.toLocaleString();
  pEl.textContent   = p.toString();
  minEl.textContent = p.toString();
}
```

- [ ] **Step 6: Update `getValidMethodsForMode`**

Find:

```js
function getValidMethodsForMode(mode) {
  return mode === 'range' ? ['lhs', 'orthogonal'] : ['fullFactorial', 'dOptimal'];
}
```

Replace with:

```js
function getValidMethodsForMode(mode) {
  return mode === 'range' ? ['lhs', 'orthogonal'] : ['fullFactorial', 'iOptimal'];
}
```

- [ ] **Step 7: Update generate dispatch**

Find:

```js
  } else if (state.method === 'dOptimal') {
    runs = generateDOptimal(f, state.methodParams.dOptimalModel, state.methodParams.dOptimalRuns);
  }
```

Replace with:

```js
  } else if (state.method === 'iOptimal') {
    runs = generateIOptimal(f, state.methodParams.iOptimalModel, state.methodParams.iOptimalRuns);
  }
```

- [ ] **Step 8: Update validation branch**

Find:

```js
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
```

Replace with:

```js
  if (state.method === 'iOptimal') {
    const N = state.methodParams.iOptimalRuns;
    if (!Number.isInteger(N) || N < 1) {
      errors.push('I-Optimal: number of runs must be a positive integer.');
    } else {
      const activeIdxs = getActiveFactorIndices(f);
      if (activeIdxs.length === 0) {
        errors.push('I-Optimal: at least one factor must have more than one level.');
      } else {
        const p = iOptimalParamCount(state.methodParams.iOptimalModel, activeIdxs.length);
        if (N < p) {
          errors.push(
            `I-Optimal: number of runs (N=${N}) must be ≥ N model parameters (p=${p}) — increase runs or switch to a smaller model.`
          );
        }
        const candidateCount =
          f.temperature.values.length *
          f.chargeLoad.values.length *
          f.dischargeLoad.values.length *
          f.termination.combinations.length;
        if (N > candidateCount) {
          errors.push(
            `I-Optimal: requested ${N} runs exceeds the ${candidateCount.toLocaleString()} candidate points; I-Optimal cannot pick more rows than exist in the Cartesian product of the factor values.`
          );
        } else if (candidateCount > 0 && N > 0.5 * candidateCount) {
          warnings.push(
            `I-Optimal: requested >50% of the candidate points (${N}/${candidateCount.toLocaleString()}) — at this density the design approaches full factorial. Consider reducing N or using Full Factorial.`
          );
        }
        if (N > 100) {
          warnings.push(
            `I-Optimal: ${N} runs is large — consider whether a screening design (LHS in Range mode) would suit better.`
          );
        }
      }
    }
  }
```

- [ ] **Step 9: Update display labels**

Find:

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

Replace with:

```js
  const modelFormShort = mf => mf === 'main2fi' ? 'main+2FI' : 'main';
  const modelFormLong  = mf => mf === 'main2fi' ? 'main effects + 2-factor interactions' : 'main effects only';
  const iM = state.methodParams.iOptimalModel;
  const iN = state.methodParams.iOptimalRuns;
  const methodShort = {
    fullFactorial: 'Full Factorial',
    lhs:           'Latin Hypercube',
    orthogonal:    `Orthogonal M=${state.methodParams.orthogonalSubdivisions}`,
    iOptimal:      `I-Optimal ${modelFormShort(iM)}, N=${iN}`,
  };
  const methodLong = {
    fullFactorial: 'Full Factorial',
    lhs:           'Latin Hypercube Sampling',
    orthogonal:    `Orthogonal Sampling (M=${state.methodParams.orthogonalSubdivisions})`,
    iOptimal:      `I-Optimal Design (${modelFormLong(iM)}, N=${iN})`,
  };
```

- [ ] **Step 10: Update init wiring (the userEdited flag, listeners, and observers)**

Find:

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

Replace with:

```js
  // I-Optimal — track whether the user has manually edited the run-count input,
  // so model-form switches only auto-update the field if it's still at default.
  let userEditedIOptimalRuns = false;
  const iOptimalRunsEl = document.getElementById('input-ioptimal-runs');
  if (iOptimalRunsEl) {
    iOptimalRunsEl.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      state.methodParams.iOptimalRuns = Number.isInteger(v) ? v : 1;
      userEditedIOptimalRuns = true;
    });
  }

  // I-Optimal model-form radios
  document.querySelectorAll('input[name="ioptimal-model"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.methodParams.iOptimalModel = radio.value;
      updateIOptimalBadge();
      // Auto-recompute the run-count default if user hasn't manually edited
      if (!userEditedIOptimalRuns && iOptimalRunsEl) {
        const activeIdxs = getActiveFactorIndices(state.factors);
        const p = iOptimalParamCount(radio.value, activeIdxs.length);
        const newDefault = Math.ceil(1.5 * p);
        state.methodParams.iOptimalRuns = newDefault;
        iOptimalRunsEl.value = newDefault;
      }
    });
  });

  // Run an initial badge update so the panel shows correct numbers when first opened
  updateIOptimalBadge();
```

- [ ] **Step 11: Update panel-input observer**

Find:

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

Replace with:

```js
  // The "total runs" badge depends on both M and on how many factors vary.
  // Refresh it (and the I-Optimal badge) whenever any input in the left panel
  // changes, or when combo rows are added/removed.
  const panel = document.querySelector('.panel');
  if (panel) panel.addEventListener('input', () => {
    updateOrthogonalBadge();
    updateIOptimalBadge();
  });
  const comboList = document.getElementById('term-combo-list');
  if (comboList) {
    new MutationObserver(() => {
      updateOrthogonalBadge();
      updateIOptimalBadge();
    }).observe(comboList, { childList: true });
  }
```

- [ ] **Step 12: Verify no `dOptimal` / `D-Optimal` references remain (except in docs)**

```bash
grep -nE 'dOptimal|D-Optimal|doptimal|D-Optimal' doe-designer.html | head -30
```

Expected: no matches. (If any show up, they're stragglers — fix them inline before committing.)

Also verify JS syntax:

```bash
awk '/<script>/,/<\/script>/' doe-designer.html | sed '1d;$d' > /tmp/doe-script.js && node --check /tmp/doe-script.js && echo "JS syntax OK"
```

Expected: `JS syntax OK`.

- [ ] **Step 13: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Convert D-Optimal to I-Optimal

Mechanical rename: state fields, HTML IDs/names/labels,
generator function, param-count helper, badge updater,
validation branch, generate dispatch, display labels, init
wiring, panel observer.

Substantive change: generateIOptimal computes the moments
matrix W = (1/|C|)·M'M once per Generate, passes 'I' + W to
fedorovExchange, and selects across restarts by smallest
trace((X'X)^-1·W) instead of largest |X'X|. Hint paragraph
text flipped to describe the new objective.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Final smoke verification

**Files:** none — verification only.

- [ ] **Step 1: JS syntax + reference check**

```bash
awk '/<script>/,/<\/script>/' doe-designer.html | sed '1d;$d' > /tmp/doe-script.js && node --check /tmp/doe-script.js && echo "JS syntax OK"
grep -nE 'dOptimal|D-Optimal|doptimal' doe-designer.html | head -20
```

Expected: `JS syntax OK`, and the grep returns no matches in `doe-designer.html` (checking only the HTML; spec/plan files in docs/ may still reference the old name — that's fine).

- [ ] **Step 2: End-to-end Node test mirroring the D-Optimal smoke test**

```bash
cat > /tmp/test-iopt-e2e.js << 'EOF'
function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

EOF
for fn in detAndInverse getActiveFactorIndices buildCandidateSet makeRowEncoder encodeAsModelMatrix iOptimalParamCount computeMomentsMatrix fedorovExchange generateIOptimal; do
  awk "/^function ${fn}/,/^}/" doe-designer.html >> /tmp/test-iopt-e2e.js
  echo "" >> /tmp/test-iopt-e2e.js
done
cat >> /tmp/test-iopt-e2e.js << 'EOF'

const factors = {
  temperature:   { values: [1, 2, 3] },
  chargeLoad:    { values: [1, 2, 3] },
  dischargeLoad: { values: [1, 2, 3] },
  termination:   { combinations: [{a:1}, {a:2}] },
};

// 1. Default config: produces 17 distinct runs
const r1 = generateIOptimal(factors, 'main2fi', 17);
console.assert(r1.length === 17, `r1 length: ${r1.length}`);
const fp1 = new Set(r1.map(r => `${r.temperature}|${r.chargeLoad}|${r.dischargeLoad}|${r.termComboIndex}`));
console.assert(fp1.size === 17, `r1 distinct: ${fp1.size}`);
console.log('I-Optimal counts default (main2fi, N=17): 17 distinct runs ✓');

// 2. Main-only with N=8
const r2 = generateIOptimal(factors, 'main', 8);
console.assert(r2.length === 8, `r2 length: ${r2.length}`);
console.log('I-Optimal counts (main, N=8): 8 runs ✓');

// 3. Pinned factor
const factorsPinned = {
  temperature:   { values: [25] },
  chargeLoad:    { values: [1, 2, 3] },
  dischargeLoad: { values: [1, 2, 3] },
  termination:   { combinations: [{a:1}, {a:2}] },
};
const r3 = generateIOptimal(factorsPinned, 'main2fi', 12);
console.assert(r3.every(r => r.temperature === 25), 'pinned temp constant in output');
console.log('I-Optimal pinned factor (3 active, main2fi, N=12): all temps=25 ✓');

// 4. Synthetic 2^4 N=8 main-effects: I-optimal == half-fraction; trace = 5/8
const synthCands = [];
for (let a = 0; a < 2; a++)
  for (let b = 0; b < 2; b++)
    for (let c = 0; c < 2; c++)
      for (let d = 0; d < 2; d++)
        synthCands.push([1, a*2-1, b*2-1, c*2-1, d*2-1]);
const W = computeMomentsMatrix(synthCands);
let bestTrace = Infinity;
let detAtBest = 0;
for (let trial = 0; trial < 5; trial++) {
  const r = fedorovExchange(synthCands, 8, 'I', W);
  if (r.trace < bestTrace) { bestTrace = r.trace; detAtBest = r.det; }
}
console.assert(Math.abs(bestTrace - 0.625) < 1e-6, `2^4 N=8 trace: ${bestTrace} (expect 5/8)`);
console.assert(Math.abs(detAtBest - 32768) < 1, `2^4 N=8 det at optimum: ${detAtBest} (expect 32768)`);
console.log(`I-Optimal Fedorov 2^4 N=8: trace=${bestTrace}, det=${detAtBest} (matches D-optimal half-fraction) ✓`);

// 5. Error paths
let threw = false;
let lastMsg = '';
try { generateIOptimal(factors, 'main2fi', 5); }
catch (e) { threw = true; lastMsg = e.message; console.log(`expected error: ${e.message}`); }
console.assert(threw, 'should throw on N < p');
console.assert(/^I-Optimal/.test(lastMsg), `error should be prefixed I-Optimal: ${lastMsg}`);

threw = false;
try { generateIOptimal(factors, 'main', 100); }
catch (e) { threw = true; console.log(`expected error: ${e.message}`); }
console.assert(threw, 'should throw on N > candidate count');

console.log('\nAll I-Optimal end-to-end tests passed.');
EOF
node /tmp/test-iopt-e2e.js
```

Expected: all five `✓` lines + the two error-path messages, ending with `All I-Optimal end-to-end tests passed.`

- [ ] **Step 3: Browser flow (manual)**

Reload the page in a browser. Walk through:

1. **First load:** Range mode default + LHS selected. The fourth method radio shows "I-Optimal Design" (was "D-Optimal Design"), greyed out with the existing hint.
2. **Switch to Counts mode:** I-Optimal radio enabled, default badges show "Candidate points: 54 · Parameters: 11 · Min runs: 11", run count 17. Hint paragraph reads "minimises the average prediction variance over the candidate region".
3. **Generate:** 17-row results table with the existing Counts-mode 5-column layout. 3D plot, 2D plot, parcoords all render.
4. **Switch model to "Main effects only":** Parameters 5, Min runs 5, Run count auto-updates to 8.
5. **Manually edit run count to 12, switch model back to main+2FI:** Run count stays at 12 (user-edited flag).
6. **Validation errors fire:** N=5 with main+2FI → "I-Optimal: number of runs (N=5) must be ≥ N model parameters (p=11)..."; N=100 → "I-Optimal: requested 100 runs exceeds the 54 candidate points..."
7. **Header label:** results header reads "17 runs · 17 cells · I-Optimal Design (main effects + 2-factor interactions, N=17)".
8. **Switch to Range mode:** I-Optimal greys out with the standard hint. LHS auto-selected.

- [ ] **Step 4: No commit needed** (verification-only task).

---

## Task 5: Rename branch

- [ ] **Step 1: Rename local branch**

```bash
git branch -m d-optimal-method i-optimal-method
git branch --show-current   # i-optimal-method
```

- [ ] **Step 2: (If pushed previously) update the remote**

If the branch was already pushed under the old name:

```bash
git push origin :d-optimal-method               # delete old remote branch
git push -u origin i-optimal-method             # push under new name
```

If never pushed: skip this step.

- [ ] **Step 3: No code commit** (housekeeping only).

---

## Self-Review Notes

**Spec coverage verified:**

- Naming map (D → I) — Task 3 covers every line of the table
- Math (criterion + W) — Task 1 (`computeMomentsMatrix`) + Task 2 (`fedorovExchange` 'I' path)
- Closed-form Δ formula — implemented inside the 'I' branch of Task 2
- Generalised `fedorovExchange` signature — Task 2
- `generateIOptimal` mirrors `generateDOptimal` 1:1 with three differences — Task 3 step 4
- Validation rename (same thresholds, message strings flipped) — Task 3 step 8
- Display labels rename + flipped strings — Task 3 step 9
- Live UI updates rename — Task 3 steps 10–11
- Branch rename — Task 5

**Type/name consistency:** `iOptimalModel`, `iOptimalRuns`, `iOptimalParamCount`, `generateIOptimal`, `updateIOptimalBadge`, `userEditedIOptimalRuns`, plus all DOM IDs (`input-ioptimal-runs`, `ioptimal-candidate-count`, `ioptimal-param-count`, `ioptimal-min-runs`, `radio-iOptimal`, `extra-iOptimal`, `name="ioptimal-model"`) used consistently across definition and call sites.

**Edge cases handled:**

- All factors held constant → `getActiveFactorIndices` returns `[]` → validation error and `generateIOptimal` throw (unchanged from D)
- N < p → validation error
- N > candidate count → validation error
- Singular initial design → 20 retries then throw (unchanged)
- 1 − α_i ≈ 0 (would-be-singular leverage) → swap skipped in the I-criterion inner loop (new defensive check)
- Backward compat for `fedorovExchange`: `criterion` defaults to `'D'`, so any future call without args gets D behavior. (No callers without args remain after Task 3, but defaulting to `'D'` keeps the function reusable.)
