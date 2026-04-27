# Range Input Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third factor-input mode (`Range`) where users supply min/max bounds per factor; LHS/Orthogonal sample continuously within the bounds, Full Factorial discretises onto a per-factor grid.

**Architecture:** Single-file vanilla-JS app (`doe-designer.html`). All changes live in three sections of that file: the embedded `<script>` (state, helpers, generators, validation, init), the `<style>` block (CSS for the new panel), and the `<body>` HTML (new mode button + panel markup). Existing modes (`values`, `counts`) remain untouched — Range mode is added as parallel state and parallel code paths inside each generator.

**Tech Stack:** Plain HTML + CSS + ES6 JavaScript. No build, no test framework — verification is manual (browser + DevTools console paste).

**Spec:** `docs/superpowers/specs/2026-04-27-range-input-mode-design.md`

**Testing approach:** This project has no test infrastructure. Each task ends with a manual verification step using the DevTools console and visual inspection. `state` is a top-level `const` exposed on `window` implicitly via the `'use strict'` script — paste `state.factors.temperature` etc. into the console to inspect.

To open the page locally:
- Windows: `start doe-designer.html`
- Or open `doe-designer.html` directly in a browser via File → Open.
- Hard refresh after each edit: Ctrl+Shift+R.

---

## File Structure

All changes are in `doe-designer.html`. No new files.

| Section | Approximate lines today | Purpose |
|---|---|---|
| Constants | 12–28 | `TEMP_MIN_ABSOLUTE`, `TERMINATION_UNITS`, etc. |
| `state` | 30–48 | App state object |
| Helpers | 50–92 | `parseValueList`, `fisherYates`, `fmt`, `comboLabel` |
| Generators | 203–366 | `generateFullFactorial`, `generateLHS`, `generateOrthogonal` |
| Validation | 370–483 | `validateInputs` |
| Dispatcher | 487–565 | `validateAndGenerate` |
| DOM sync | 1110–1165 | `syncStateFromCountsDOM`, `syncStateFromDOM` |
| Orthogonal badge | 1170–1223 | `countActiveOrthogonalFactors`, `updateOrthogonalBadge` |
| Init | 1227–1362 | Event listeners, default combo row |
| CSS | 1364–~2160 | `.mode-toggle`, `.factor-card`, etc. |
| HTML body | 2165–end | Panel markup |

---

## Task 1: State scaffolding and `roundFor` helper

**Files:**
- Modify: `doe-designer.html` (state object near line 30, helpers near line 50)

- [ ] **Step 1.1: Update `state.inputMode` comment and add `range` defaults to each factor**

In `doe-designer.html`, replace the `state` block at lines ~30–48 with:

```js
const state = {
  factors: {
    temperature:   {
      values: [],
      range: { min: 25, max: 45, levels: 3 },
    },
    chargeLoad:    {
      values: [],
      unit: 'A',
      range: { min: 0.5, max: 1.0, levels: 3 },
    },
    dischargeLoad: {
      values: [],
      unit: 'A',
      range: { min: 0.5, max: 1.0, levels: 3 },
    },
    // Each combo: { dischargeType, dischargeValue, chargeType, chargeValue }
    termination:   {
      combinations: [],
      range: {
        dischargeType:  'Voltage', dischargeMin: 2.5, dischargeMax: 4.2,
        chargeType:     'Voltage', chargeMin:    2.5, chargeMax:    4.2,
        levels:         3,
      },
    },
  },
  method: 'fullFactorial',
  methodParams: {
    samples:                20,
    orthogonalSubdivisions: 2,
  },
  repeats:        1,
  inputMode:      'counts', // 'values' | 'counts' | 'range'
  plotTab:        '3d',     // '3d' | '2d'
  highlightedRun: null,
  results:        null,
};
```

- [ ] **Step 1.2: Add `roundFor` helper**

After the `fmt` function (line ~85), add:

```js
/**
 * Round a sampled value to a sensible default precision per factor.
 * Termination value precision keys off the *type* (passed in), not the factor.
 *
 * factorKey: 'temperature' | 'chargeLoad' | 'dischargeLoad'
 *          | 'termination.discharge' | 'termination.charge'
 * terminationType: optional, only used for termination.* keys
 */
function roundFor(factorKey, value, terminationType) {
  let dp;
  if (factorKey === 'temperature') {
    dp = 1;
  } else if (factorKey === 'chargeLoad' || factorKey === 'dischargeLoad') {
    dp = 2;
  } else if (factorKey === 'termination.discharge' || factorKey === 'termination.charge') {
    if (terminationType === 'Voltage')      dp = 3;
    else if (terminationType === 'Time')    dp = 0;
    else                                    dp = 2; // Current, Energy, Charge Capacity, SOC*
  } else {
    dp = 2;
  }
  const k = Math.pow(10, dp);
  return Math.round(value * k) / k;
}
```

- [ ] **Step 1.3: Manual verification**

1. Hard-refresh `doe-designer.html` in the browser.
2. Open DevTools console.
3. Paste:
   ```js
   roundFor('temperature', 31.74829)               // expect 31.7
   roundFor('chargeLoad', 0.67315)                 // expect 0.67
   roundFor('termination.discharge', 4.20512, 'Voltage')  // expect 4.205
   roundFor('termination.charge', 1230.7, 'Time')         // expect 1231
   roundFor('termination.charge', 0.51, 'Current')        // expect 0.51
   state.factors.temperature.range                 // expect {min: 25, max: 45, levels: 3}
   state.factors.termination.range.dischargeType   // expect "Voltage"
   ```
4. All values match expected. No console errors.

- [ ] **Step 1.4: Commit**

```bash
git add doe-designer.html
git commit -m "Add range-mode state scaffolding and roundFor helper"
```

---

## Task 2: Range panel HTML and CSS

**Files:**
- Modify: `doe-designer.html` (mode-toggle near line 2179, panel markup after `mode-counts` panel ~line 2303, CSS ~line 1582)

- [ ] **Step 2.1: Add third mode button**

Find the `.mode-toggle` block (around line 2179):

```html
<div class="mode-toggle" role="tablist" aria-label="Input mode">
  <button type="button" class="mode-btn active" data-mode="counts" role="tab">Level counts</button>
  <button type="button" class="mode-btn" data-mode="values" role="tab">Exact values</button>
</div>
```

Replace with:

```html
<div class="mode-toggle" role="tablist" aria-label="Input mode">
  <button type="button" class="mode-btn active" data-mode="counts" role="tab">Level counts</button>
  <button type="button" class="mode-btn" data-mode="values" role="tab">Exact values</button>
  <button type="button" class="mode-btn" data-mode="range"  role="tab">Range</button>
</div>
```

- [ ] **Step 2.2: Add the Range panel markup**

Find the closing `</div>` of `mode-counts` (right after the `input-term-count` factor card, around line 2303). Immediately after the `</div>` that closes `id="mode-counts"`, insert:

```html
<!-- ── Range mode ── -->
<div id="mode-range" class="hidden">
  <p class="section-hint">
    Specify a min/max range per factor. LHS and Orthogonal Sampling draw continuous
    values within each range; Full Factorial uses the per-factor <em>Levels</em> input
    to slice the range into evenly-spaced points.
  </p>

  <!-- Temperature -->
  <div class="factor-card">
    <label class="factor-label">Temperature</label>
    <div class="range-input-grid">
      <label class="range-sub-label">Min</label>
      <input type="number" id="input-temp-range-min" class="factor-input" value="25" step="any" />
      <span class="unit-label">°C</span>

      <label class="range-sub-label">Max</label>
      <input type="number" id="input-temp-range-max" class="factor-input" value="45" step="any" />
      <span class="unit-label">°C</span>

      <label class="range-sub-label range-levels-label">Levels</label>
      <input type="number" id="input-temp-range-levels" class="factor-input range-levels-input" value="3" min="1" step="1" />
      <span class="unit-label range-levels-unit">levels</span>
    </div>
    <p class="field-hint">Valid range: −20 to 80 °C. <em>Levels</em> only applies to Full Factorial.</p>
  </div>

  <!-- Charge Load -->
  <div class="factor-card">
    <label class="factor-label">Charge Load</label>
    <div class="range-input-grid">
      <label class="range-sub-label">Min</label>
      <input type="number" id="input-charge-range-min" class="factor-input" value="0.5" step="any" />
      <span class="unit-label" id="charge-range-unit-min">A</span>

      <label class="range-sub-label">Max</label>
      <input type="number" id="input-charge-range-max" class="factor-input" value="1.0" step="any" />
      <span class="unit-label" id="charge-range-unit-max">A</span>

      <label class="range-sub-label range-levels-label">Levels</label>
      <input type="number" id="input-charge-range-levels" class="factor-input range-levels-input" value="3" min="1" step="1" />
      <span class="unit-label range-levels-unit">levels</span>
    </div>
  </div>

  <!-- Discharge Load -->
  <div class="factor-card">
    <label class="factor-label">Discharge Load</label>
    <div class="range-input-grid">
      <label class="range-sub-label">Min</label>
      <input type="number" id="input-discharge-range-min" class="factor-input" value="0.5" step="any" />
      <span class="unit-label" id="discharge-range-unit-min">A</span>

      <label class="range-sub-label">Max</label>
      <input type="number" id="input-discharge-range-max" class="factor-input" value="1.0" step="any" />
      <span class="unit-label" id="discharge-range-unit-max">A</span>

      <label class="range-sub-label range-levels-label">Levels</label>
      <input type="number" id="input-discharge-range-levels" class="factor-input range-levels-input" value="3" min="1" step="1" />
      <span class="unit-label range-levels-unit">levels</span>
    </div>
  </div>

  <!-- Termination -->
  <div class="factor-card">
    <label class="factor-label">Termination</label>
    <p class="field-hint" style="margin-top:0;margin-bottom:8px;">
      Pick one termination type per side. Discharge and charge termination values are sampled together (same fraction of the range) on each run.
    </p>

    <!-- Discharge sub-section -->
    <div class="range-term-side">
      <span class="combo-side-label">Discharge Termination</span>
      <div class="range-input-grid">
        <label class="range-sub-label">Type</label>
        <select id="input-term-range-discharge-type" class="unit-select" style="grid-column: span 2;"></select>

        <label class="range-sub-label">Min</label>
        <input type="number" id="input-term-range-discharge-min" class="factor-input" value="2.5" step="any" />
        <span class="unit-label" id="term-range-discharge-unit-min">V</span>

        <label class="range-sub-label">Max</label>
        <input type="number" id="input-term-range-discharge-max" class="factor-input" value="4.2" step="any" />
        <span class="unit-label" id="term-range-discharge-unit-max">V</span>
      </div>
    </div>

    <!-- Charge sub-section -->
    <div class="range-term-side" style="margin-top: 10px;">
      <span class="combo-side-label">Charge Termination</span>
      <div class="range-input-grid">
        <label class="range-sub-label">Type</label>
        <select id="input-term-range-charge-type" class="unit-select" style="grid-column: span 2;"></select>

        <label class="range-sub-label">Min</label>
        <input type="number" id="input-term-range-charge-min" class="factor-input" value="2.5" step="any" />
        <span class="unit-label" id="term-range-charge-unit-min">V</span>

        <label class="range-sub-label">Max</label>
        <input type="number" id="input-term-range-charge-max" class="factor-input" value="4.2" step="any" />
        <span class="unit-label" id="term-range-charge-unit-max">V</span>
      </div>
    </div>

    <!-- Shared levels input -->
    <div class="range-input-grid" style="margin-top: 10px;">
      <label class="range-sub-label range-levels-label">Levels</label>
      <input type="number" id="input-term-range-levels" class="factor-input range-levels-input" value="3" min="1" step="1" />
      <span class="unit-label range-levels-unit">levels</span>
    </div>
  </div>
</div>
```

- [ ] **Step 2.3: Add CSS for the range panel**

Find the `.field-hint` rule (around line 1582). Immediately after it, add:

```css
/* ── Range mode ── */
.range-input-grid {
  display: grid;
  grid-template-columns: 60px 1fr 36px;
  align-items: center;
  gap: 6px 8px;
  margin-top: 4px;
}
.range-sub-label {
  font-size: 0.78rem;
  color: var(--gray-muted);
  font-weight: 500;
}
.range-term-side .combo-side-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--gray);
  margin-bottom: 4px;
  margin-top: 2px;
}
.range-levels-input.disabled-input,
.range-levels-label.disabled-input,
.range-levels-unit.disabled-input {
  opacity: 0.45;
  pointer-events: none;
}
.range-levels-input.disabled-input {
  background: var(--gray-100);
}
```

- [ ] **Step 2.4: Manual verification**

1. Hard-refresh the page.
2. The mode toggle now shows three buttons: `Level counts | Exact values | Range`.
3. In DevTools, run:
   ```js
   document.getElementById('mode-range').classList.remove('hidden');
   document.getElementById('mode-counts').classList.add('hidden');
   ```
4. The Range panel should be visible with 4 factor cards (Temperature, Charge Load, Discharge Load, Termination).
5. Each numeric factor shows three rows (Min, Max, Levels) with placeholders/units.
6. Termination shows two type dropdowns (currently empty — wired up in Task 3) plus min/max for each side and a single Levels input.
7. The grid layout looks tidy (labels aligned, units aligned). No layout breakage on the rest of the page.
8. Reset DevTools state by reloading.

- [ ] **Step 2.5: Commit**

```bash
git add doe-designer.html
git commit -m "Add Range-mode panel markup and styling"
```

---

## Task 3: Mode toggle handler and state sync

**Files:**
- Modify: `doe-designer.html` (mode-button handler ~line 1229, `syncStateFromDOM` ~line 1137, init function ~line 1227)

- [ ] **Step 3.1: Update mode-button click handler to handle `range`**

Find the mode-button handler (around line 1229–1243):

```js
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (mode !== 'values' && mode !== 'counts') return;
    state.inputMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode)
    );
    const valuesPanel = document.getElementById('mode-values');
    const countsPanel = document.getElementById('mode-counts');
    if (valuesPanel) valuesPanel.classList.toggle('hidden', mode !== 'values');
    if (countsPanel) countsPanel.classList.toggle('hidden', mode !== 'counts');
    updateOrthogonalBadge();
  });
});
```

Replace with:

```js
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (mode !== 'values' && mode !== 'counts' && mode !== 'range') return;
    state.inputMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode)
    );
    const valuesPanel = document.getElementById('mode-values');
    const countsPanel = document.getElementById('mode-counts');
    const rangePanel  = document.getElementById('mode-range');
    if (valuesPanel) valuesPanel.classList.toggle('hidden', mode !== 'values');
    if (countsPanel) countsPanel.classList.toggle('hidden', mode !== 'counts');
    if (rangePanel)  rangePanel.classList.toggle('hidden',  mode !== 'range');
    updateRangeLevelsDisabled();
    updateOrthogonalBadge();
  });
});
```

(`updateRangeLevelsDisabled` is added in Task 4 — for now, define a stub at the top of the script file's helper section so this doesn't error. Add right after the `roundFor` definition from Task 1:)

```js
function updateRangeLevelsDisabled() { /* implemented in Task 4 */ }
```

- [ ] **Step 3.2: Populate termination type dropdowns and unit labels in init()**

Find the `init()` function (around line 1227). Just before `addComboRow();` (around line 1353), add:

```js
// Range mode: populate termination type dropdowns
const populateTermTypes = (selectId, types, defaultType) => {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === defaultType) opt.selected = true;
    sel.appendChild(opt);
  });
};
populateTermTypes('input-term-range-discharge-type', DISCHARGE_TERM_TYPES, state.factors.termination.range.dischargeType);
populateTermTypes('input-term-range-charge-type',    CHARGE_TERM_TYPES,    state.factors.termination.range.chargeType);

// Range mode: keep unit labels in sync with type dropdowns
const wireRangeUnitSync = (selectId, unitMinId, unitMaxId) => {
  const sel = document.getElementById(selectId);
  const unitMin = document.getElementById(unitMinId);
  const unitMax = document.getElementById(unitMaxId);
  if (!sel || !unitMin || !unitMax) return;
  const update = () => {
    const u = TERMINATION_UNITS[sel.value] || '';
    unitMin.textContent = u;
    unitMax.textContent = u;
  };
  sel.addEventListener('change', update);
  update();
};
wireRangeUnitSync('input-term-range-discharge-type', 'term-range-discharge-unit-min', 'term-range-discharge-unit-max');
wireRangeUnitSync('input-term-range-charge-type',    'term-range-charge-unit-min',    'term-range-charge-unit-max');

// Range mode: keep charge/discharge load unit labels in sync with their unit selectors
const wireLoadUnitSync = (loadSelectId, unitMinId, unitMaxId) => {
  const sel = document.getElementById(loadSelectId);
  const unitMin = document.getElementById(unitMinId);
  const unitMax = document.getElementById(unitMaxId);
  if (!sel || !unitMin || !unitMax) return;
  const update = () => { unitMin.textContent = sel.value; unitMax.textContent = sel.value; };
  sel.addEventListener('change', update);
  update();
};
wireLoadUnitSync('select-charge-unit',    'charge-range-unit-min',    'charge-range-unit-max');
wireLoadUnitSync('select-discharge-unit', 'discharge-range-unit-min', 'discharge-range-unit-max');
```

- [ ] **Step 3.3: Add `syncStateFromRangeDOM` and update dispatcher**

Find `syncStateFromCountsDOM` (around line 1115). Just below it, add:

```js
/**
 * Range-mode sync: read min/max/levels per factor and the termination type+min/max
 * pair into state.factors.*.range.
 */
function syncStateFromRangeDOM() {
  const readNum = id => {
    const el = document.getElementById(id);
    if (!el) return NaN;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : NaN;
  };
  const readInt = id => {
    const el = document.getElementById(id);
    if (!el) return NaN;
    const v = parseInt(el.value, 10);
    return Number.isInteger(v) ? v : NaN;
  };

  state.factors.temperature.range = {
    min:    readNum('input-temp-range-min'),
    max:    readNum('input-temp-range-max'),
    levels: readInt('input-temp-range-levels'),
  };
  state.factors.chargeLoad.range = {
    min:    readNum('input-charge-range-min'),
    max:    readNum('input-charge-range-max'),
    levels: readInt('input-charge-range-levels'),
  };
  state.factors.dischargeLoad.range = {
    min:    readNum('input-discharge-range-min'),
    max:    readNum('input-discharge-range-max'),
    levels: readInt('input-discharge-range-levels'),
  };
  state.factors.termination.range = {
    dischargeType:  document.getElementById('input-term-range-discharge-type').value,
    dischargeMin:   readNum('input-term-range-discharge-min'),
    dischargeMax:   readNum('input-term-range-discharge-max'),
    chargeType:     document.getElementById('input-term-range-charge-type').value,
    chargeMin:      readNum('input-term-range-charge-min'),
    chargeMax:      readNum('input-term-range-charge-max'),
    levels:         readInt('input-term-range-levels'),
  };
}
```

- [ ] **Step 3.4: Update `syncStateFromDOM` dispatch**

Find `syncStateFromDOM` (around line 1137). Replace its top section:

```js
function syncStateFromDOM() {
  if (state.inputMode === 'counts') {
    syncStateFromCountsDOM();
    return;
  }
  // ... existing values-mode code below
```

with:

```js
function syncStateFromDOM() {
  if (state.inputMode === 'counts') {
    syncStateFromCountsDOM();
    return;
  }
  if (state.inputMode === 'range') {
    syncStateFromRangeDOM();
    return;
  }
  // ... existing values-mode code below
```

- [ ] **Step 3.5: Manual verification**

1. Hard-refresh the page.
2. Click the `Range` mode button. The panel should switch to the Range view; `Range` button gets the active style.
3. Both termination type dropdowns are now populated (Voltage, Time, etc.). Unit labels next to min/max match the selected type (`V` for Voltage, `s` for Time, etc.).
4. Change `Discharge Termination` type to `Time`. Both unit labels in that sub-section flip to `s`.
5. In DevTools console: `state.inputMode` → `'range'`.
6. Edit the temperature `Min` field to `30`, then run `syncStateFromDOM(); state.factors.temperature.range`. Expect `{min: 30, max: 45, levels: 3}`.
7. Click `Level counts` button — Range panel hides, Counts panel shows, `state.inputMode === 'counts'`.

- [ ] **Step 3.6: Commit**

```bash
git add doe-designer.html
git commit -m "Wire range-mode tab toggle and DOM sync"
```

---

## Task 4: Levels-input greyed-out for non-fullFactorial methods

**Files:**
- Modify: `doe-designer.html` (replace stub `updateRangeLevelsDisabled` near `roundFor`, hook into method radio handler ~line 1247)

- [ ] **Step 4.1: Replace the stub `updateRangeLevelsDisabled`**

Find the stub added in Task 3:

```js
function updateRangeLevelsDisabled() { /* implemented in Task 4 */ }
```

Replace with:

```js
/**
 * Show/hide the disabled styling on Range-mode "Levels" inputs.
 * Levels only affects Full Factorial; LHS/Orthogonal sample continuously.
 */
function updateRangeLevelsDisabled() {
  const isFullFactorial = state.method === 'fullFactorial';
  const isRangeMode     = state.inputMode === 'range';
  // Disable when in range mode AND method is not full-factorial.
  const shouldDisable = isRangeMode && !isFullFactorial;
  document.querySelectorAll(
    '.range-levels-input, .range-levels-label, .range-levels-unit'
  ).forEach(el => el.classList.toggle('disabled-input', shouldDisable));
}
```

- [ ] **Step 4.2: Hook into method radio handler**

Find the method radio handler (around line 1246–1252):

```js
document.querySelectorAll('input[name="doe-method"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.method-extra').forEach(el => el.classList.add('hidden'));
    document.getElementById(`extra-${radio.value}`).classList.remove('hidden');
    state.method = radio.value;
  });
});
```

Replace with:

```js
document.querySelectorAll('input[name="doe-method"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.method-extra').forEach(el => el.classList.add('hidden'));
    document.getElementById(`extra-${radio.value}`).classList.remove('hidden');
    state.method = radio.value;
    updateRangeLevelsDisabled();
  });
});
```

- [ ] **Step 4.3: Initial call**

At the very end of `init()` (just before the closing `}`), add:

```js
updateRangeLevelsDisabled();
```

- [ ] **Step 4.4: Manual verification**

1. Hard-refresh.
2. Click `Range` mode → method is `Full Factorial` (default) → Levels inputs look normal (full opacity).
3. Click `Latin Hypercube Sampling` radio → all three numeric Levels inputs and the termination Levels input become greyed out (45% opacity, no pointer events).
4. Click `Orthogonal Sampling` radio → still greyed out.
5. Click `Full Factorial` radio → ungreyed.
6. Switch to `Level counts` mode → no greying applies anywhere (the Levels inputs in Counts mode are different elements).

- [ ] **Step 4.5: Commit**

```bash
git add doe-designer.html
git commit -m "Grey out Range-mode Levels inputs when method is LHS or Orthogonal"
```

---

## Task 5: `compileRangeToValues` helper

**Files:**
- Modify: `doe-designer.html` (helpers section, after `roundFor`)

- [ ] **Step 5.1: Add the helper**

Right after `roundFor` from Task 1 (and after the stub-replaced `updateRangeLevelsDisabled` from Task 4), add:

```js
/**
 * Generate `levels` evenly-spaced values between min and max (inclusive).
 * If levels === 1, returns [min]. If min === max, all entries are the same.
 */
function linspace(min, max, levels) {
  if (levels <= 1) return [min];
  const step = (max - min) / (levels - 1);
  const out = [];
  for (let i = 0; i < levels; i++) out.push(min + step * i);
  return out;
}

/**
 * Compile a factor's range into the discrete values list expected by
 * Full Factorial. Numeric factors return number[]; termination returns
 * combo objects (the discrete analogue of the paired-sampling rule used
 * in continuous methods — combo i uses index i of both per-side linspaces).
 */
function compileRangeToValues(factorKey) {
  if (factorKey === 'termination') {
    const r = state.factors.termination.range;
    const dVals = linspace(r.dischargeMin, r.dischargeMax, r.levels);
    const cVals = linspace(r.chargeMin,    r.chargeMax,    r.levels);
    return dVals.map((dv, i) => ({
      dischargeType:  r.dischargeType,
      dischargeValue: roundFor('termination.discharge', dv, r.dischargeType),
      chargeType:     r.chargeType,
      chargeValue:    roundFor('termination.charge',    cVals[i], r.chargeType),
    }));
  }
  const r = state.factors[factorKey].range;
  return linspace(r.min, r.max, r.levels).map(v => roundFor(factorKey, v));
}
```

- [ ] **Step 5.2: Manual verification**

1. Hard-refresh.
2. Click `Range` mode (so the range panel is active and state has been sync'd).
3. In console, force a sync first then test:
   ```js
   syncStateFromDOM();
   compileRangeToValues('temperature')
   // expect [25, 35, 45] (levels=3, min=25, max=45, rounded to 1 dp)

   compileRangeToValues('chargeLoad')
   // expect [0.5, 0.75, 1] (rounded to 2 dp)

   compileRangeToValues('termination')
   // expect 3 combo objects, each with dischargeType: 'Voltage',
   //   dischargeValue rising 2.5 → 3.35 → 4.2 (rounded to 3 dp because Voltage)
   ```
4. Change Levels to 5 in the temperature card, run `syncStateFromDOM(); compileRangeToValues('temperature')` → expect `[25, 30, 35, 40, 45]`.
5. Change `levels` to 1: expect `[25]` (single-element array).

- [ ] **Step 5.3: Commit**

```bash
git add doe-designer.html
git commit -m "Add compileRangeToValues helper for range-to-grid discretisation"
```

---

## Task 6: Full Factorial in range mode

**Files:**
- Modify: `doe-designer.html` (`generateFullFactorial` ~line 205)

- [ ] **Step 6.1: Add range dispatch to `generateFullFactorial`**

Find `generateFullFactorial` (around line 205–232):

```js
function generateFullFactorial(factors) {
  const lists = [
    factors.temperature.values,
    factors.chargeLoad.values,
    factors.dischargeLoad.values,
    factors.termination.combinations,
  ];
  // ... rest unchanged
```

Replace with:

```js
function generateFullFactorial(factors) {
  const isRange = state.inputMode === 'range';
  const lists = isRange
    ? [
        compileRangeToValues('temperature'),
        compileRangeToValues('chargeLoad'),
        compileRangeToValues('dischargeLoad'),
        compileRangeToValues('termination'),
      ]
    : [
        factors.temperature.values,
        factors.chargeLoad.values,
        factors.dischargeLoad.values,
        factors.termination.combinations,
      ];

  let runs = [[]];
  for (const list of lists) {
    const expanded = [];
    for (const partial of runs) {
      for (const v of list) {
        expanded.push([...partial, v]);
      }
    }
    runs = expanded;
  }

  // termComboIndex: in range mode, lists[3] is *generated* combos with no
  // canonical user-specified index; just use the position in the list.
  const termList = lists[3];
  return runs.map((r, i) => ({
    run:            i + 1,
    temperature:    r[0],
    chargeLoad:     r[1],
    dischargeLoad:  r[2],
    termCombo:      r[3],
    termComboIndex: termList.indexOf(r[3]) + 1,
  }));
}
```

- [ ] **Step 6.2: Manual verification**

1. Hard-refresh.
2. Click `Range` mode. Method should default to `Full Factorial`.
3. Set temperature range to 25–45, levels=3. Charge 0.5–1.0, levels=2. Discharge 0.5–1.0, levels=2. Termination V 2.5–4.2, levels=2.
4. Click `Generate`.
5. Expected: 3 × 2 × 2 × 2 = **24 runs** in the results table.
6. Inspect the values in the table:
   - Temperature column: only 25.0, 35.0, 45.0 appear (no continuous values).
   - Charge Load: only 0.50, 1.00.
   - Termination discharge values: only 2.500, 4.200 V.
7. CSV download should contain those same values.
8. Check `Levels = 1` edge case: set temperature levels=1, regenerate → 12 runs; only one temperature value (25.0).

- [ ] **Step 6.3: Commit**

```bash
git add doe-designer.html
git commit -m "Support Range mode in Full Factorial via compileRangeToValues"
```

---

## Task 7: LHS in range mode

**Files:**
- Modify: `doe-designer.html` (`generateLHS` ~line 234)

- [ ] **Step 7.1: Refactor `generateLHS` for range mode**

Find `generateLHS` (around line 234–269) and replace the entire function with:

```js
function generateLHS(factors, n) {
  const isRange = state.inputMode === 'range';

  // Per-factor sampler: takes a stratum-uniform u in [0,1) and returns the
  // sampled value for that factor on this run.
  const numericLists = isRange ? null : [
    factors.temperature.values,
    factors.chargeLoad.values,
    factors.dischargeLoad.values,
  ];
  const combos = isRange ? null : factors.termination.combinations;

  const sampleNumeric = (factorKey, listIdx, u) => {
    if (isRange) {
      const r = factors[factorKey].range;
      return roundFor(factorKey, r.min + u * (r.max - r.min));
    }
    const list = numericLists[listIdx];
    const idx = Math.min(Math.floor(u * list.length), list.length - 1);
    return list[idx];
  };

  const sampleTermCombo = (u) => {
    if (isRange) {
      const r = factors.termination.range;
      return {
        dischargeType:  r.dischargeType,
        dischargeValue: roundFor(
          'termination.discharge',
          r.dischargeMin + u * (r.dischargeMax - r.dischargeMin),
          r.dischargeType
        ),
        chargeType:     r.chargeType,
        chargeValue:    roundFor(
          'termination.charge',
          r.chargeMin + u * (r.chargeMax - r.chargeMin),
          r.chargeType
        ),
      };
    }
    const idx = Math.min(Math.floor(u * combos.length), combos.length - 1);
    return combos[idx];
  };

  // Four independent stratum permutations (same Latin-hypercube construction
  // as before — what changes is how each `u` maps to a value).
  const perms = [0, 1, 2, 3].map(
    () => fisherYates(Array.from({ length: n }, (_, i) => i))
  );

  const samples = [];
  for (let i = 0; i < n; i++) {
    const uFor = k => (perms[k][i] + Math.random()) / n;

    const temperature   = sampleNumeric('temperature',   0, uFor(0));
    const chargeLoad    = sampleNumeric('chargeLoad',    1, uFor(1));
    const dischargeLoad = sampleNumeric('dischargeLoad', 2, uFor(2));
    const termCombo     = sampleTermCombo(uFor(3));

    // termComboIndex: in range mode there's no canonical list, so we use the
    // run-position index. In discrete mode we look up the combo's index.
    const termComboIndex = isRange
      ? i + 1
      : combos.indexOf(termCombo) + 1;

    samples.push({
      run: i + 1,
      temperature,
      chargeLoad,
      dischargeLoad,
      termCombo,
      termComboIndex,
    });
  }
  return samples;
}
```

- [ ] **Step 7.2: Manual verification**

1. Hard-refresh.
2. Click `Range` mode. Click `Latin Hypercube Sampling`. Set Number of samples = 20.
3. Set temperature 25–45, charge 0.2–1.0, discharge 0.2–1.0, termination Voltage 2.5–4.2.
4. Click `Generate`.
5. Expected: 20 rows. Temperature values are continuous (e.g. `27.3`, `41.8`), all within `[25, 45]`, rounded to 1 dp. Charge/discharge values to 2 dp. Termination voltages to 3 dp.
6. Click `Generate` again — values should be different (fresh random sample), but still distributed across the ranges.
7. **Latin-hypercube property check**: for a given run, sort the 20 temperature values and inspect them — they should be roughly evenly spaced across `[25, 45]` (one per stratum of width 1.0 °C).
8. Sanity-check that discrete-LHS still works: switch to `Exact values` mode, type `25, 35, 45` for temperature, generate → only those three temps appear.

- [ ] **Step 7.3: Commit**

```bash
git add doe-designer.html
git commit -m "Support Range mode in LHS with continuous per-stratum sampling"
```

---

## Task 8: Orthogonal in range mode

**Files:**
- Modify: `doe-designer.html` (`generateOrthogonal` ~line 285)

- [ ] **Step 8.1: Refactor `generateOrthogonal` for range mode**

Find `generateOrthogonal` (around line 285–366) and replace the entire function with:

```js
function generateOrthogonal(factors, M) {
  const isRange = state.inputMode === 'range';

  // Determine which factors are "active" (vary across runs).
  const factorKeys = ['temperature', 'chargeLoad', 'dischargeLoad', 'termination'];
  const isActive = factorKeys.map(key => {
    if (isRange) {
      if (key === 'termination') {
        const r = factors.termination.range;
        return r.dischargeMin < r.dischargeMax || r.chargeMin < r.chargeMax;
      }
      const r = factors[key].range;
      return r.min < r.max;
    }
    if (key === 'termination') {
      return factors.termination.combinations.length > 1;
    }
    return factors[key].values.length > 1;
  });

  const activeFactorIdxs = [];
  for (let i = 0; i < 4; i++) if (isActive[i]) activeFactorIdxs.push(i);
  const d = activeFactorIdxs.length;

  // Pre-compute discrete lists for non-range mode (and constant fallback values).
  const allLists = isRange ? null : [
    factors.temperature.values,
    factors.chargeLoad.values,
    factors.dischargeLoad.values,
    factors.termination.combinations,
  ];

  // Sampler shared between LHS and Orthogonal logic.
  const sampleNumeric = (factorKey, listIdx, u) => {
    if (isRange) {
      const r = factors[factorKey].range;
      return roundFor(factorKey, r.min + u * (r.max - r.min));
    }
    const list = allLists[listIdx];
    if (list.length <= 1) return list[0];
    const idx = Math.min(Math.floor(u * list.length), list.length - 1);
    return list[idx];
  };
  const sampleTermCombo = (u) => {
    if (isRange) {
      const r = factors.termination.range;
      return {
        dischargeType:  r.dischargeType,
        dischargeValue: roundFor(
          'termination.discharge',
          r.dischargeMin + u * (r.dischargeMax - r.dischargeMin),
          r.dischargeType
        ),
        chargeType:     r.chargeType,
        chargeValue:    roundFor(
          'termination.charge',
          r.chargeMin + u * (r.chargeMax - r.chargeMin),
          r.chargeType
        ),
      };
    }
    const list = allLists[3];
    if (list.length <= 1) return list[0];
    const idx = Math.min(Math.floor(u * list.length), list.length - 1);
    return list[idx];
  };

  // Edge case: all factors constant → a single run.
  if (d === 0) {
    return [{
      run:            1,
      temperature:    sampleNumeric('temperature',   0, 0),
      chargeLoad:     sampleNumeric('chargeLoad',    1, 0),
      dischargeLoad:  sampleNumeric('dischargeLoad', 2, 0),
      termCombo:      sampleTermCombo(0),
      termComboIndex: 1,
    }];
  }

  const N       = Math.pow(M, d);
  const subBins = Math.pow(M, d - 1);

  // Enumerate all M^d super-cells across the active dimensions only.
  const superCells = [];
  (function build(dim, cur) {
    if (dim === d) { superCells.push([...cur]); return; }
    for (let m = 0; m < M; m++) { cur[dim] = m; build(dim + 1, cur); }
  })(0, new Array(d));

  // Per-active-dimension fine-bin assignment (preserves Latin-hypercube property).
  const fineBins = [];
  for (let dim = 0; dim < d; dim++) {
    const cellsByBin = Array.from({ length: M }, () => []);
    superCells.forEach((sc, idx) => cellsByBin[sc[dim]].push(idx));

    const dimFineBins = new Array(superCells.length);
    for (let m = 0; m < M; m++) {
      const perm = fisherYates(Array.from({ length: subBins }, (_, i) => i));
      cellsByBin[m].forEach((cellIdx, i) => {
        dimFineBins[cellIdx] = m * subBins + perm[i];
      });
    }
    fineBins.push(dimFineBins);
  }

  // Compute u for each factor on each sample.
  const uFor = (factorIdx, sampleIdx) => {
    if (!isActive[factorIdx]) return 0; // constant factor: u=0 → min
    const activeDim = activeFactorIdxs.indexOf(factorIdx);
    const bin = fineBins[activeDim][sampleIdx];
    return (bin + Math.random()) / N;
  };

  return superCells.map((_, i) => {
    const temperature   = sampleNumeric('temperature',   0, uFor(0, i));
    const chargeLoad    = sampleNumeric('chargeLoad',    1, uFor(1, i));
    const dischargeLoad = sampleNumeric('dischargeLoad', 2, uFor(2, i));
    const termCombo     = sampleTermCombo(uFor(3, i));

    const termComboIndex = isRange
      ? i + 1
      : (allLists[3].indexOf(termCombo) + 1) || 1;

    return {
      run: i + 1,
      temperature,
      chargeLoad,
      dischargeLoad,
      termCombo,
      termComboIndex,
    };
  });
}
```

- [ ] **Step 8.2: Manual verification**

1. Hard-refresh.
2. Click `Range`, then `Orthogonal Sampling`. Subdivisions per factor (M) = 2.
3. Default ranges (all 4 active). Generate.
4. Expected: 2⁴ = 16 runs. All values are continuous, within their ranges, rounded.
5. Set `Discharge Load` min=max (e.g. min=0.5, max=0.5). The orthogonal badge should drop from 16 to 8 (`M³ = 8`, since discharge is now constant).
6. Generate. All 8 runs have `dischargeLoad === 0.5`.
7. Set termination both `dischargeMin == dischargeMax` AND `chargeMin == chargeMax`. Active count drops by 1 more → badge shows 4. Generate. All runs have identical termCombo values.
8. Sanity-check non-range mode still works: switch to `Level counts` mode, M=2 → still 16 runs with placeholder values.

- [ ] **Step 8.3: Commit**

```bash
git add doe-designer.html
git commit -m "Support Range mode in Orthogonal sampling"
```

---

## Task 9: Validation in range mode

**Files:**
- Modify: `doe-designer.html` (`validateInputs` ~line 370)

- [ ] **Step 9.1: Add range branch to `validateInputs`**

Find `validateInputs` (around line 370). Locate the `if (isCounts) { ... } else { ... }` block (around line 376–422) and replace it with:

```js
  const isCounts = state.inputMode === 'counts';
  const isRange  = state.inputMode === 'range';

  if (isCounts) {
    const countChecks = [
      ['Temperature levels',    f.temperature.values.length],
      ['Charge load levels',    f.chargeLoad.values.length],
      ['Discharge load levels', f.dischargeLoad.values.length],
      ['Termination levels',    f.termination.combinations.length],
    ];
    countChecks.forEach(([name, n]) => {
      if (n < 1) errors.push(`${name}: must be at least 1.`);
    });
  } else if (isRange) {
    const r = f.temperature.range;
    if (!Number.isFinite(r.min) || !Number.isFinite(r.max)) {
      errors.push('Temperature: please enter numeric min and max.');
    } else if (r.min > r.max) {
      errors.push('Temperature: min must be ≤ max.');
    } else if (r.min < TEMP_MIN_ABSOLUTE || r.max > TEMP_MAX_ABSOLUTE) {
      errors.push(
        `Temperature: range must lie within [${TEMP_MIN_ABSOLUTE}, ${TEMP_MAX_ABSOLUTE}] °C.`
      );
    }

    const checkPositive = (key, name) => {
      const rr = f[key].range;
      if (!Number.isFinite(rr.min) || !Number.isFinite(rr.max)) {
        errors.push(`${name}: please enter numeric min and max.`);
      } else if (rr.min > rr.max) {
        errors.push(`${name}: min must be ≤ max.`);
      } else if (rr.min <= 0 || rr.max <= 0) {
        errors.push(`${name}: min and max must be > 0.`);
      }
    };
    checkPositive('chargeLoad',    'Charge Load');
    checkPositive('dischargeLoad', 'Discharge Load');

    const tr = f.termination.range;
    const checkTermSide = (sideLabel, minV, maxV) => {
      if (!Number.isFinite(minV) || !Number.isFinite(maxV)) {
        errors.push(`Termination ${sideLabel}: please enter numeric min and max.`);
      } else if (minV > maxV) {
        errors.push(`Termination ${sideLabel}: min must be ≤ max.`);
      } else if (minV < 0 || maxV < 0) {
        errors.push(`Termination ${sideLabel}: min and max must be ≥ 0.`);
      }
    };
    checkTermSide('discharge', tr.dischargeMin, tr.dischargeMax);
    checkTermSide('charge',    tr.chargeMin,    tr.chargeMax);

    // Levels validation only matters for Full Factorial — but invalid
    // entries (e.g. NaN) shouldn't pass even for the other methods.
    const levelChecks = [
      ['Temperature',    f.temperature.range.levels],
      ['Charge Load',    f.chargeLoad.range.levels],
      ['Discharge Load', f.dischargeLoad.range.levels],
      ['Termination',    f.termination.range.levels],
    ];
    levelChecks.forEach(([name, lv]) => {
      if (!Number.isInteger(lv) || lv < 1) {
        errors.push(`${name} levels: must be an integer ≥ 1.`);
      }
    });

    // Soft-warn when levels=1 with a non-trivial range under Full Factorial.
    if (state.method === 'fullFactorial') {
      const lvWarn = (name, lv, minV, maxV) => {
        if (lv === 1 && Number.isFinite(minV) && Number.isFinite(maxV) && minV !== maxV) {
          warnings.push(
            `${name}: Levels = 1 with a non-trivial range — only the min value will be used (max is ignored).`
          );
        }
      };
      lvWarn('Temperature',    f.temperature.range.levels,    f.temperature.range.min,    f.temperature.range.max);
      lvWarn('Charge Load',    f.chargeLoad.range.levels,     f.chargeLoad.range.min,     f.chargeLoad.range.max);
      lvWarn('Discharge Load', f.dischargeLoad.range.levels,  f.dischargeLoad.range.min,  f.dischargeLoad.range.max);
      lvWarn('Termination (discharge)', f.termination.range.levels, tr.dischargeMin, tr.dischargeMax);
      lvWarn('Termination (charge)',    f.termination.range.levels, tr.chargeMin,    tr.chargeMax);
    }
  } else {
    // Existing values-mode block — unchanged
    if (f.temperature.values.length === 0) {
      errors.push('Temperature: please enter at least one value.');
    } else {
      const outOfRange = f.temperature.values.filter(
        v => v < TEMP_MIN_ABSOLUTE || v > TEMP_MAX_ABSOLUTE
      );
      if (outOfRange.length > 0) {
        errors.push(
          `Temperature: values ${outOfRange.join(', ')} °C are outside the allowed range [${TEMP_MIN_ABSOLUTE}, ${TEMP_MAX_ABSOLUTE}] °C.`
        );
      }
    }
    if (f.chargeLoad.values.length === 0) {
      errors.push('Charge Load: please enter at least one value.');
    }
    if (f.dischargeLoad.values.length === 0) {
      errors.push('Discharge Load: please enter at least one value.');
    }
    if (f.termination.combinations.length === 0) {
      errors.push('Termination Combinations: please add at least one combination.');
    } else {
      f.termination.combinations.forEach((c, i) => {
        if (isNaN(c.dischargeValue)) {
          errors.push(`Termination Combination ${i + 1}: discharge value is missing or invalid.`);
        }
        if (isNaN(c.chargeValue)) {
          errors.push(`Termination Combination ${i + 1}: charge value is missing or invalid.`);
        }
      });
    }
  }
```

(Note: this preserves the existing values-mode block exactly; only the surrounding control flow changes from `if/else` to `if/else if/else`.)

- [ ] **Step 9.2: Update `activeCount` computation in the Orthogonal validation block**

Around line 442, the existing code checks discrete-mode list lengths to compute `activeCount`. Replace that block (around line 437–459):

```js
  if (state.method === 'orthogonal') {
    const M = state.methodParams.orthogonalSubdivisions;
    if (!Number.isInteger(M) || M < 2) {
      errors.push('Orthogonal Sampling: subdivisions per factor must be an integer ≥ 2.');
    } else {
      const activeCount = [
        f.temperature.values.length,
        f.chargeLoad.values.length,
        f.dischargeLoad.values.length,
        f.termination.combinations.length,
      ].filter(len => len > 1).length;
      const N = activeCount === 0 ? 1 : Math.pow(M, activeCount);
      if (N > 10000) { /* ... */ }
      else if (N > 500) { /* ... */ }
    }
  }
```

with:

```js
  if (state.method === 'orthogonal') {
    const M = state.methodParams.orthogonalSubdivisions;
    if (!Number.isInteger(M) || M < 2) {
      errors.push('Orthogonal Sampling: subdivisions per factor must be an integer ≥ 2.');
    } else {
      const activeCount = isRange
        ? [
            f.temperature.range.min   < f.temperature.range.max,
            f.chargeLoad.range.min    < f.chargeLoad.range.max,
            f.dischargeLoad.range.min < f.dischargeLoad.range.max,
            f.termination.range.dischargeMin < f.termination.range.dischargeMax
              || f.termination.range.chargeMin < f.termination.range.chargeMax,
          ].filter(Boolean).length
        : [
            f.temperature.values.length,
            f.chargeLoad.values.length,
            f.dischargeLoad.values.length,
            f.termination.combinations.length,
          ].filter(len => len > 1).length;
      const N = activeCount === 0 ? 1 : Math.pow(M, activeCount);
      if (N > 10000) {
        errors.push(
          `Orthogonal Sampling: M^${activeCount} = ${N.toLocaleString()} runs exceeds the 10,000 run limit.`
        );
      } else if (N > 500) {
        warnings.push(
          `Orthogonal Sampling: this configuration will produce ${N.toLocaleString()} runs.`
        );
      }
    }
  }
```

- [ ] **Step 9.3: Update Full Factorial run-count validation for range mode**

Around line 461–480, replace the `state.method === 'fullFactorial'` block:

```js
  if (state.method === 'fullFactorial') {
    const lengths = isRange
      ? [
          f.temperature.range.levels,
          f.chargeLoad.range.levels,
          f.dischargeLoad.range.levels,
          f.termination.range.levels,
        ]
      : [
          f.temperature.values.length,
          f.chargeLoad.values.length,
          f.dischargeLoad.values.length,
          f.termination.combinations.length,
        ];
    if (lengths.every(l => Number.isInteger(l) && l > 0)) {
      const totalRuns = lengths.reduce((a, b) => a * b, 1);
      if (totalRuns > 10000) {
        errors.push(
          `Full Factorial: this configuration would produce ${totalRuns.toLocaleString()} runs, which exceeds the 10,000 run limit.`
        );
      } else if (totalRuns > 500) {
        warnings.push(
          `Full Factorial: this configuration will produce ${totalRuns.toLocaleString()} runs.`
        );
      }
    }
  }
```

- [ ] **Step 9.4: Manual verification**

1. Hard-refresh.
2. `Range` mode + `Full Factorial`. Set Temperature min=100, max=50 → click Generate. Expect error: "Temperature: min must be ≤ max."
3. Set Temperature min=-50, max=20 → expect "must lie within [-20, 80] °C".
4. Set Charge min=0, max=1 → expect "min and max must be > 0".
5. Set Termination discharge min=-1, max=2 → expect "min and max must be ≥ 0".
6. Set Temperature levels=0 → expect "must be an integer ≥ 1".
7. Set valid ranges + Temperature levels=1, min=25, max=45 → click Generate. Expect a yellow warning "Temperature: Levels = 1 with a non-trivial range — only the min value will be used".
8. `Range` mode + `Orthogonal`, all 4 factors active, M=4 → 4⁴=256 runs (warning above 500 doesn't trigger). Set M=6 → 6⁴=1296 runs → warning. Set M=10 → 10⁴=10000 → still passes. Set M=11 → 14641 → error.

- [ ] **Step 9.5: Commit**

```bash
git add doe-designer.html
git commit -m "Validate range-mode inputs and update run-count caps"
```

---

## Task 10: Orthogonal badge in range mode

**Files:**
- Modify: `doe-designer.html` (`countActiveOrthogonalFactors` ~line 1174, `panel` listener ~line 1273)

- [ ] **Step 10.1: Update `countActiveOrthogonalFactors`**

Find `countActiveOrthogonalFactors` (around line 1174–1196) and replace with:

```js
function countActiveOrthogonalFactors() {
  if (state.inputMode === 'counts') {
    return ['input-temp-count', 'input-charge-count', 'input-discharge-count', 'input-term-count']
      .filter(id => {
        const el = document.getElementById(id);
        if (!el) return false;
        const v = parseInt(el.value, 10);
        return Number.isInteger(v) && v > 1;
      }).length;
  }

  if (state.inputMode === 'range') {
    const readNum = id => {
      const el = document.getElementById(id);
      if (!el) return NaN;
      return parseFloat(el.value);
    };
    let active = 0;
    if (readNum('input-temp-range-min')      < readNum('input-temp-range-max'))      active++;
    if (readNum('input-charge-range-min')    < readNum('input-charge-range-max'))    active++;
    if (readNum('input-discharge-range-min') < readNum('input-discharge-range-max')) active++;
    const termActive =
      readNum('input-term-range-discharge-min') < readNum('input-term-range-discharge-max')
      || readNum('input-term-range-charge-min')    < readNum('input-term-range-charge-max');
    if (termActive) active++;
    return active;
  }

  // Values mode
  let active = 0;
  const uniqueCount = id => {
    const el = document.getElementById(id);
    if (!el) return 0;
    return parseValueList(el.value).values.length;
  };
  if (uniqueCount('input-temperature') > 1) active++;
  if (uniqueCount('input-charge')      > 1) active++;
  if (uniqueCount('input-discharge')   > 1) active++;
  if (document.querySelectorAll('.term-combo-row').length > 1) active++;
  return active;
}
```

- [ ] **Step 10.2: Manual verification**

1. Hard-refresh.
2. `Range` mode + `Orthogonal`, M=2. Default ranges → badge says **16** (`M⁴ = 2⁴ = 16`).
3. Set temperature min=max=25 → badge updates live to **8** (`M³ = 2³ = 8`).
4. Set termination discharge min=max AND charge min=max → badge updates to **4** (`M² = 4`).
5. Set every range with min==max → badge updates to **1** (`all factors constant → 1 run`).
6. Switch to `Level counts` mode → badge respects the level count inputs.

- [ ] **Step 10.3: Commit**

```bash
git add doe-designer.html
git commit -m "Update orthogonal-runs badge to count active range-mode factors"
```

---

## Task 11: End-to-end smoke test

- [ ] **Step 11.1: Run through every mode × method combination once**

For each combination, set sensible inputs, click Generate, confirm the results table renders and the CSV download produces a file with matching values.

| Mode | Method | Expected behaviour |
|---|---|---|
| Level counts | Full Factorial | (existing) |
| Level counts | LHS | (existing) |
| Level counts | Orthogonal | (existing) |
| Exact values | Full Factorial | (existing) |
| Exact values | LHS | (existing) |
| Exact values | Orthogonal | (existing) |
| Range | Full Factorial | Discrete grid values, e.g. T ∈ {25.0, 35.0, 45.0} |
| Range | LHS | Continuous T ∈ [25, 45], evenly stratified, rounded to 1 dp |
| Range | Orthogonal | Continuous T ∈ [25, 45], M^d runs |

In each case, also confirm:
- Switching the input-mode tab does not lose values from the other modes (state persists).
- The 3D and 2D plots render against the result.
- No console errors at any point.

- [ ] **Step 11.2: Commit (no code changes — informational)**

If everything passed, no commit needed. If you found issues, fix them and commit per the standard task format.

---

## Out-of-scope reminders

These were explicitly deferred in the spec — do not implement here:

- Per-factor mode mixing.
- User-configurable rounding precision.
- A full-factorial run-count badge (only the orthogonal badge exists today).
- Type-specific upper-bound validation on termination values.
- Independent strata for discharge vs. charge termination values in continuous methods (single `u` is used by design).
