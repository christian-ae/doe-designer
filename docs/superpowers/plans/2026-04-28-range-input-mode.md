# Range Input Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third factor-input mode (`Range`) where users supply per-factor `min`/`max` bounds, used by continuous LHS and Orthogonal samplers (stratum-midpoint sampling); make method availability mode-locked (Full Factorial only in counts/values modes; LHS/Orthogonal only in Range mode).

**Architecture:** Single-file HTML app, all changes in `doe-designer.html`. Approach is additive: new `range` sub-fields on `state.factors` coexist with existing `values` arrays; new `mode-range` panel sits alongside `mode-counts` and `mode-values`; new `generateLHSContinuous` and `generateOrthogonalContinuous` functions sit alongside the discrete versions; existing code paths are only touched to add an `inputMode === 'range'` branch.

**Tech Stack:** Vanilla JS (ES6+), HTML, CSS, Plotly. No test framework — verification is manual (browser + DevTools console).

**Spec:** [docs/superpowers/specs/2026-04-28-range-input-mode-design.md](../specs/2026-04-28-range-input-mode-design.md)

---

## File Structure

All changes are in [doe-designer.html](../../../doe-designer.html). Per-section line ranges (current file, will shift as tasks land):

- **State** (lines 30–48): add `range` fields per factor + termination range subtree
- **Samplers** (lines 234–366): add two new continuous samplers
- **Validation** (lines 370–477): add Range-mode branch
- **Generate dispatch** (lines 519–525): add Range-mode branches
- **Results & display** (`getVarOptions` 654, `renderTable` 589, `renderParCoords` 858, `downloadCSV` 1055)
- **DOM sync** (`syncStateFromDOM` 1137): add `syncStateFromRangeDOM`
- **Orthogonal badge** (`countActiveOrthogonalFactors` 1174): add Range branch
- **Init / event wiring** (`init` 1227): mode-toggle extraction, listener attachment for new inputs
- **HTML** (mode toggle 2179, panel divs 2185+, method options 2310+): add `mode-range` panel + Range button
- **CSS** (lines around 1944–2000): add `.method-disabled` styling + Range panel cosmetics

Each task below produces one focused commit that keeps the app functional.

---

## Task 1: Add `range` fields to state (scaffolding)

**Files:**
- Modify: `doe-designer.html` (state object near line 30–48)

- [ ] **Step 1: Update the state object**

Replace the existing `state` object literal with:

```js
const state = {
  factors: {
    temperature:   { values: [], range: { min: null, max: null } },
    chargeLoad:    { values: [], unit: 'A', range: { min: null, max: null } },
    dischargeLoad: { values: [], unit: 'A', range: { min: null, max: null } },
    termination: {
      combinations: [],
      range: {
        discharge: { type: 'Voltage', min: null, max: null },
        charge:    { type: 'Voltage', min: null, max: null },
      },
    },
  },
  method: 'fullFactorial',
  methodParams: {
    samples:                20,
    orthogonalSubdivisions: 2,
  },
  repeats:        1,
  inputMode:      'counts',
  plotTab:        '3d',
  highlightedRun: null,
  results:        null,
};
```

Note: defaults stay at `'counts'` and `'fullFactorial'` for now — the switch to `'range'` / `'lhs'` happens in the final task once everything else is wired up.

- [ ] **Step 2: Verify state shape in DevTools**

Open `doe-designer.html` in a browser. In the DevTools console:

```js
state.factors.temperature.range            // { min: null, max: null }
state.factors.termination.range.discharge  // { type: 'Voltage', min: null, max: null }
state.factors.termination.range.charge     // { type: 'Voltage', min: null, max: null }
```

Expected: each line returns the object shown. Existing fields (`values`, `combinations`, `unit`) still present and unchanged. The page renders normally — no behavioral change yet.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add range fields to state scaffolding

Additive only — every factor gains an optional range subobject,
termination gains a range subtree with per-side type and bounds.
Defaults remain unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add Range-mode panel HTML and supporting CSS

**Files:**
- Modify: `doe-designer.html` (insert new `<div id="mode-range">` block before `<div id="mode-values">` near line 2185; add CSS in the `<style>` block)

- [ ] **Step 1: Insert the Range panel HTML**

Find the existing line:

```html
      <!-- ── Exact values mode ── -->
      <div id="mode-values" class="hidden">
```

(near line 2184). Immediately **before** that line, insert:

```html
      <!-- ── Range mode ── -->
      <div id="mode-range" class="hidden">
        <p class="section-hint">
          Specify min/max bounds per factor. LHS and Orthogonal Sampling will sample continuously within these ranges. Use Level counts mode for Full Factorial designs.
        </p>

        <!-- Temperature -->
        <div class="factor-card">
          <label class="factor-label">Temperature</label>
          <div class="range-input-wrap">
            <input type="number" id="input-range-temp-min" class="factor-input range-input"
                   placeholder="min" value="0" step="any" />
            <span class="range-sep">to</span>
            <input type="number" id="input-range-temp-max" class="factor-input range-input"
                   placeholder="max" value="50" step="any" />
            <span class="unit-label">°C</span>
          </div>
          <p class="field-hint">Valid range: −20 to 80 °C</p>
        </div>

        <!-- Charge Load -->
        <div class="factor-card">
          <label class="factor-label">Charge Load</label>
          <div class="range-input-wrap">
            <input type="number" id="input-range-charge-min" class="factor-input range-input"
                   placeholder="min" value="0" step="any" />
            <span class="range-sep">to</span>
            <input type="number" id="input-range-charge-max" class="factor-input range-input"
                   placeholder="max" value="5" step="any" />
            <select id="input-range-charge-unit" class="unit-select" aria-label="Charge load unit">
              <option value="A">A</option>
              <option value="C">C-rate</option>
              <option value="W">W</option>
            </select>
          </div>
        </div>

        <!-- Discharge Load -->
        <div class="factor-card">
          <label class="factor-label">Discharge Load</label>
          <div class="range-input-wrap">
            <input type="number" id="input-range-discharge-min" class="factor-input range-input"
                   placeholder="min" value="0" step="any" />
            <span class="range-sep">to</span>
            <input type="number" id="input-range-discharge-max" class="factor-input range-input"
                   placeholder="max" value="5" step="any" />
            <select id="input-range-discharge-unit" class="unit-select" aria-label="Discharge load unit">
              <option value="A">A</option>
              <option value="C">C-rate</option>
              <option value="W">W</option>
            </select>
          </div>
        </div>

        <!-- Discharge Termination -->
        <div class="factor-card">
          <label class="factor-label">Discharge Termination</label>
          <div class="range-input-wrap">
            <select id="input-range-disch-term-type" class="unit-select" aria-label="Discharge termination type">
              <option value="Voltage">Voltage</option>
              <option value="Time">Time</option>
              <option value="Energy Capacity">Energy Capacity</option>
              <option value="Charge Capacity">Charge Capacity</option>
              <option value="SOCmin">SOCmin</option>
            </select>
            <input type="number" id="input-range-disch-term-min" class="factor-input range-input"
                   placeholder="min" value="2.5" step="any" />
            <span class="range-sep">to</span>
            <input type="number" id="input-range-disch-term-max" class="factor-input range-input"
                   placeholder="max" value="4.2" step="any" />
            <span id="input-range-disch-term-unit" class="unit-label">V</span>
          </div>
        </div>

        <!-- Charge Termination -->
        <div class="factor-card">
          <label class="factor-label">Charge Termination</label>
          <div class="range-input-wrap">
            <select id="input-range-chg-term-type" class="unit-select" aria-label="Charge termination type">
              <option value="Voltage">Voltage</option>
              <option value="Time">Time</option>
              <option value="Energy Capacity">Energy Capacity</option>
              <option value="Charge Capacity">Charge Capacity</option>
              <option value="SOCmax">SOCmax</option>
            </select>
            <input type="number" id="input-range-chg-term-min" class="factor-input range-input"
                   placeholder="min" value="2.5" step="any" />
            <span class="range-sep">to</span>
            <input type="number" id="input-range-chg-term-max" class="factor-input range-input"
                   placeholder="max" value="4.2" step="any" />
            <span id="input-range-chg-term-unit" class="unit-label">V</span>
          </div>
        </div>
      </div>

```

- [ ] **Step 2: Add CSS for `.range-input-wrap` and `.range-sep`**

Find an existing CSS rule for `.factor-input-wrap` in the `<style>` block (around line 1944 area — search for `.factor-input-wrap`). Immediately **after** that rule, add:

```css
.range-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.range-input-wrap .range-input {
  flex: 1 1 80px;
  min-width: 0;
}
.range-input-wrap .unit-select {
  flex: 0 0 auto;
}
.range-sep {
  font-size: 0.85rem;
  color: var(--gray-subtle);
  padding: 0 2px;
}
```

- [ ] **Step 3: Verify the panel renders**

Open the page in a browser. The Range panel is `class="hidden"` so it should not be visible. In the DevTools console:

```js
const r = document.getElementById('mode-range');
r.classList.remove('hidden');     // panel becomes visible
```

Expected: five factor cards appear with min/max inputs, separator "to", unit labels/selects on the right, and the section hint at the top. Re-add `'hidden'` to put it back:

```js
r.classList.add('hidden');
```

- [ ] **Step 4: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add Range-mode panel HTML and styling

Five factor cards (temperature, charge load, discharge load,
discharge termination, charge termination) with min/max inputs.
Hidden by default — wired up in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add Range button to mode toggle (clickable, panel visibility only)

**Files:**
- Modify: `doe-designer.html` (mode toggle around line 2179, init handler around line 1228)

- [ ] **Step 1: Add the Range button to the toggle**

Find:

```html
      <div class="mode-toggle" role="tablist" aria-label="Input mode">
        <button type="button" class="mode-btn active" data-mode="counts" role="tab">Level counts</button>
        <button type="button" class="mode-btn" data-mode="values" role="tab">Exact values</button>
      </div>
```

Replace with (Range first, but Counts still has `active` class for now — we'll flip the default in the final task):

```html
      <div class="mode-toggle" role="tablist" aria-label="Input mode">
        <button type="button" class="mode-btn" data-mode="range" role="tab">Range</button>
        <button type="button" class="mode-btn active" data-mode="counts" role="tab">Level counts</button>
        <button type="button" class="mode-btn" data-mode="values" role="tab">Exact values</button>
      </div>
```

- [ ] **Step 2: Update the toggle handler to recognise `'range'`**

Find this block in the `init` function (around line 1228):

```js
  // Input-mode toggle (Exact values / Level counts)
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
  // Input-mode toggle (Range / Level counts / Exact values)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode !== 'range' && mode !== 'values' && mode !== 'counts') return;
      state.inputMode = mode;
      document.querySelectorAll('.mode-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === mode)
      );
      const rangePanel  = document.getElementById('mode-range');
      const valuesPanel = document.getElementById('mode-values');
      const countsPanel = document.getElementById('mode-counts');
      if (rangePanel)  rangePanel.classList.toggle('hidden',  mode !== 'range');
      if (valuesPanel) valuesPanel.classList.toggle('hidden', mode !== 'values');
      if (countsPanel) countsPanel.classList.toggle('hidden', mode !== 'counts');
      updateOrthogonalBadge();
    });
  });
```

- [ ] **Step 3: Verify the toggle works**

Reload the page. Click the **Range** button. Expected:
- Range button gets the `active` class (visible blue/highlight per existing styling)
- Range panel becomes visible; Counts panel hides
- Console: `state.inputMode === 'range'` returns `true`

Click **Level counts** — Counts panel returns; `state.inputMode === 'counts'`. Click **Exact values** — Values panel appears; `state.inputMode === 'values'`. The buttons cycle correctly.

Note: the method radio cards are not yet mode-locked — that comes in Task 5. Generate is also not yet wired for Range — that comes in Task 11.

- [ ] **Step 4: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add Range button to mode toggle

Three-way toggle now switches between Range, Level counts,
and Exact values panels. Method-mode coupling and Range
data flow come in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extract `setInputMode()` and centralise mode-switch logic

**Files:**
- Modify: `doe-designer.html` (init handler around line 1228 — extract into a top-level function)

- [ ] **Step 1: Replace the inline toggle handler with a call to `setInputMode`**

Find the toggle handler from Task 3 and replace its **inner body** with a call:

```js
  // Input-mode toggle (Range / Level counts / Exact values)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode !== 'range' && mode !== 'values' && mode !== 'counts') return;
      setInputMode(mode);
    });
  });
```

- [ ] **Step 2: Add `setInputMode()` as a top-level function**

Just **above** the `function init()` declaration (around line 1227), insert:

```js
// ── Mode switching ─────────────────────────────────────────────────────────

/**
 * Apply a new input mode: update state, button highlight, panel visibility,
 * method availability, and orthogonal badge. Single entry point used by both
 * the init wiring and any future programmatic mode changes.
 */
function setInputMode(mode) {
  state.inputMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode)
  );
  const rangePanel  = document.getElementById('mode-range');
  const valuesPanel = document.getElementById('mode-values');
  const countsPanel = document.getElementById('mode-counts');
  if (rangePanel)  rangePanel.classList.toggle('hidden',  mode !== 'range');
  if (valuesPanel) valuesPanel.classList.toggle('hidden', mode !== 'values');
  if (countsPanel) countsPanel.classList.toggle('hidden', mode !== 'counts');
  updateOrthogonalBadge();
}
```

- [ ] **Step 3: Verify mode-switch still works**

Reload the page. Click each mode button. Expected: same behaviour as Task 3 — panels and `state.inputMode` track the active button. In DevTools:

```js
setInputMode('range');     // panel switches programmatically
setInputMode('counts');    // back to Counts
```

Both calls update the UI as expected.

- [ ] **Step 4: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Extract setInputMode() for centralised mode switching

Pull the mode-toggle body into a single function so future hooks
(method availability, axis re-population) can be added in one place.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add `applyMethodAvailability()`, disabled-method CSS, and auto-reselect

**Files:**
- Modify: `doe-designer.html` (CSS in `<style>` block; new function near `setInputMode`; existing method radio handler around line 1246; method option HTML around line 2310 to add hint placeholders)

- [ ] **Step 1: Add CSS for disabled method cards**

Find the existing `.method-option` rule in the `<style>` block (search for `.method-option`). Immediately after it, add:

```css
.method-option.method-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.method-option.method-disabled .method-label {
  cursor: not-allowed;
}
.method-disabled-hint {
  display: none;
  font-size: 0.8rem;
  color: var(--gray-subtle);
  margin: 4px 0 0 0;
  padding-left: 22px;
}
.method-option.method-disabled .method-disabled-hint {
  display: block;
}
```

- [ ] **Step 2: Add disabled-hint placeholders to the three method options**

Find:

```html
        <label class="method-label">
          <input type="radio" name="doe-method" id="radio-fullFactorial" value="fullFactorial" checked />
          Full Factorial
        </label>
```

Immediately **after** the closing `</label>`, add:

```html
        <p class="method-disabled-hint">Available in Level counts and Exact values modes.</p>
```

Find:

```html
        <label class="method-label">
          <input type="radio" name="doe-method" id="radio-lhs" value="lhs" />
          Latin Hypercube Sampling
        </label>
```

Immediately **after** the closing `</label>`, add:

```html
        <p class="method-disabled-hint">Available in Range mode only.</p>
```

Find:

```html
        <label class="method-label">
          <input type="radio" name="doe-method" id="radio-orthogonal" value="orthogonal" />
          Orthogonal Sampling
        </label>
```

Immediately **after** the closing `</label>`, add:

```html
        <p class="method-disabled-hint">Available in Range mode only.</p>
```

- [ ] **Step 3: Add `getValidMethodsForMode()` and `applyMethodAvailability()`**

Just **above** the `function setInputMode(mode)` declaration (added in Task 4), insert:

```js
/** Methods enabled in each input mode. */
function getValidMethodsForMode(mode) {
  return mode === 'range' ? ['lhs', 'orthogonal'] : ['fullFactorial'];
}

/**
 * Walk the three method radios; disable any that aren't valid for the current
 * input mode, collapse their detail panels, and auto-reselect a sensible
 * default if the current selection just became invalid.
 */
function applyMethodAvailability() {
  const valid = getValidMethodsForMode(state.inputMode);
  const radios = document.querySelectorAll('input[name="doe-method"]');

  radios.forEach(radio => {
    const ok    = valid.includes(radio.value);
    const card  = radio.closest('.method-option');
    radio.disabled = !ok;
    if (card) card.classList.toggle('method-disabled', !ok);
    if (!ok) {
      const extra = document.getElementById(`extra-${radio.value}`);
      if (extra) extra.classList.add('hidden');
    }
  });

  // If current method is no longer valid, auto-reselect.
  if (!valid.includes(state.method)) {
    const fallback = state.inputMode === 'range' ? 'lhs' : 'fullFactorial';
    const radio    = document.getElementById(`radio-${fallback}`);
    if (radio) {
      radio.checked = true;
      state.method  = fallback;
      const extra = document.getElementById(`extra-${fallback}`);
      if (extra) extra.classList.remove('hidden');
    }
  }
}
```

- [ ] **Step 4: Call `applyMethodAvailability()` from `setInputMode`**

In the `setInputMode` function, find:

```js
  if (countsPanel) countsPanel.classList.toggle('hidden', mode !== 'counts');
  updateOrthogonalBadge();
}
```

Replace with:

```js
  if (countsPanel) countsPanel.classList.toggle('hidden', mode !== 'counts');
  applyMethodAvailability();
  updateOrthogonalBadge();
}
```

- [ ] **Step 5: Call `applyMethodAvailability()` once on load**

In the `init` function, find the line that ends the mode-toggle wiring:

```js
  // Input-mode toggle (Range / Level counts / Exact values)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode !== 'range' && mode !== 'values' && mode !== 'counts') return;
      setInputMode(mode);
    });
  });
```

Immediately **after** the closing `});` for `forEach`, insert:

```js
  // Apply initial method availability for the default mode.
  applyMethodAvailability();
```

- [ ] **Step 6: Verify disabled cards and auto-reselect**

Reload. By default (Counts mode), Full Factorial radio is checked; LHS and Orthogonal radios appear greyed out with the hint "Available in Range mode only." underneath each.

Click **Range**. Expected:
- Full Factorial radio greys out, hint "Available in Level counts and Exact values modes." shows
- LHS and Orthogonal radios become enabled and lose the hint
- LHS radio is auto-selected (current was `'fullFactorial'`, fallback for Range is `'lhs'`)
- `state.method === 'lhs'` in console
- The LHS `.method-extra` panel ("Number of samples") becomes visible

Click **Level counts**. Expected:
- LHS/Orthogonal grey out, hints reappear
- Full Factorial auto-selected
- `state.method === 'fullFactorial'`
- The Full Factorial `.method-extra` panel is visible (its hint is the only content there)

Click **Range** again, then click the (now-disabled) Full Factorial radio. Expected: nothing happens — it's `disabled`.

- [ ] **Step 7: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Lock methods to compatible modes and auto-reselect

Full Factorial disabled in Range mode; LHS and Orthogonal
disabled in Level counts and Exact values modes. Greyed cards
show a hint pointing to the compatible mode. Switching modes
auto-reselects a sensible default if the current method
becomes invalid.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add `syncStateFromRangeDOM()` for Range-mode DOM↔state sync

**Files:**
- Modify: `doe-designer.html` (`syncStateFromDOM` around line 1137)

- [ ] **Step 1: Add `syncStateFromRangeDOM()`**

Just **above** the existing `function syncStateFromCountsDOM()` (around line 1115), insert:

```js
/**
 * Range-mode sync: pull min/max bounds, unit selections, and termination
 * type selections from the DOM into state. Blank inputs become null so
 * validation can distinguish "not entered" from a literal zero.
 */
function syncStateFromRangeDOM() {
  const readNum = id => {
    const el = document.getElementById(id);
    if (!el) return null;
    const raw = el.value.trim();
    if (raw === '') return null;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : null;
  };
  const readVal = id => {
    const el = document.getElementById(id);
    return el ? el.value : null;
  };

  const f = state.factors;

  f.temperature.range.min   = readNum('input-range-temp-min');
  f.temperature.range.max   = readNum('input-range-temp-max');

  f.chargeLoad.range.min    = readNum('input-range-charge-min');
  f.chargeLoad.range.max    = readNum('input-range-charge-max');
  f.chargeLoad.unit         = readVal('input-range-charge-unit') || f.chargeLoad.unit;

  f.dischargeLoad.range.min = readNum('input-range-discharge-min');
  f.dischargeLoad.range.max = readNum('input-range-discharge-max');
  f.dischargeLoad.unit      = readVal('input-range-discharge-unit') || f.dischargeLoad.unit;

  f.termination.range.discharge.type = readVal('input-range-disch-term-type') || f.termination.range.discharge.type;
  f.termination.range.discharge.min  = readNum('input-range-disch-term-min');
  f.termination.range.discharge.max  = readNum('input-range-disch-term-max');

  f.termination.range.charge.type = readVal('input-range-chg-term-type') || f.termination.range.charge.type;
  f.termination.range.charge.min  = readNum('input-range-chg-term-min');
  f.termination.range.charge.max  = readNum('input-range-chg-term-max');
}
```

- [ ] **Step 2: Wire `syncStateFromDOM` to dispatch on Range mode**

Find the existing function:

```js
function syncStateFromDOM() {
  if (state.inputMode === 'counts') {
    syncStateFromCountsDOM();
    return;
  }

  const parseAndStore = (inputId, factorKey) => {
```

Replace the **opening lines** (down to and including the second `return;`) with:

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

  const parseAndStore = (inputId, factorKey) => {
```

(I.e. add a 4-line Range branch immediately after the counts branch and before the existing Values-mode logic.)

- [ ] **Step 3: Verify sync via DevTools**

Reload. Switch to **Range** mode. In DevTools console:

```js
syncStateFromRangeDOM();
state.factors.temperature.range            // { min: 0, max: 50 } (the HTML defaults)
state.factors.chargeLoad.range             // { min: 0, max: 5 }
state.factors.chargeLoad.unit              // 'A'
state.factors.termination.range.discharge  // { type: 'Voltage', min: 2.5, max: 4.2 }
state.factors.termination.range.charge     // { type: 'Voltage', min: 2.5, max: 4.2 }
```

Expected: every field matches the HTML default values.

Now manually clear the temperature-min input in the UI, then:

```js
syncStateFromRangeDOM();
state.factors.temperature.range.min        // null
```

Expected: blank parses to `null`.

- [ ] **Step 4: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add Range-mode DOM-to-state sync

syncStateFromRangeDOM reads the five min/max pairs, two unit
selects, and two termination type selects into state. Blank
numeric inputs become null so validation can distinguish
unentered from literal zero. syncStateFromDOM dispatches
on inputMode.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Live unit-suffix updates for termination type dropdowns

**Files:**
- Modify: `doe-designer.html` (init function around line 1227)

- [ ] **Step 1: Add helper for live unit-label updates**

Just **above** the `function init()` declaration, insert:

```js
/**
 * Update the unit-label suffix displayed next to a Range-mode termination
 * row when its type dropdown changes (e.g. Voltage → V, SOCmin → %).
 */
function updateRangeTermUnitLabel(side) {
  const isDisch = side === 'discharge';
  const typeId  = isDisch ? 'input-range-disch-term-type' : 'input-range-chg-term-type';
  const unitId  = isDisch ? 'input-range-disch-term-unit' : 'input-range-chg-term-unit';
  const typeEl  = document.getElementById(typeId);
  const unitEl  = document.getElementById(unitId);
  if (!typeEl || !unitEl) return;
  unitEl.textContent = TERMINATION_UNITS[typeEl.value] || '';
}
```

- [ ] **Step 2: Wire dropdown change listeners**

Inside the `init` function, just **before** the existing `// 3D plot axis selectors — re-render on change` comment (around line 1317), insert:

```js
  // Range-mode termination type dropdowns — live unit-label updates
  ['discharge', 'charge'].forEach(side => {
    const typeId = side === 'discharge' ? 'input-range-disch-term-type' : 'input-range-chg-term-type';
    const el = document.getElementById(typeId);
    if (el) {
      el.addEventListener('change', () => {
        updateRangeTermUnitLabel(side);
        // Update state too so getVarOptions / CSV pick up the new type immediately.
        state.factors.termination.range[side].type = el.value;
      });
    }
  });

  // Range-mode load unit dropdowns — keep state.factors.*.unit in sync immediately
  const rcUnit = document.getElementById('input-range-charge-unit');
  if (rcUnit) rcUnit.addEventListener('change', e => {
    state.factors.chargeLoad.unit = e.target.value;
  });
  const rdUnit = document.getElementById('input-range-discharge-unit');
  if (rdUnit) rdUnit.addEventListener('change', e => {
    state.factors.dischargeLoad.unit = e.target.value;
  });
```

- [ ] **Step 3: Verify live updates**

Reload, switch to **Range** mode. Open Discharge Termination row's type dropdown and select **Time**. Expected:
- The unit suffix to the right of the max input changes from `V` to `s`
- `state.factors.termination.range.discharge.type === 'Time'` in console

Try **SOCmin** → suffix becomes `%`. Try **Energy Capacity** → suffix becomes `Wh`. Repeat for Charge Termination. Try changing the Charge Load unit dropdown to **C-rate** → `state.factors.chargeLoad.unit === 'C'`.

- [ ] **Step 4: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Live unit-suffix updates for Range termination types

Selecting a different termination type (Voltage / Time / Energy
/ Charge / SOC) updates the right-side unit label and writes the
new type to state immediately, so plot axis labels and CSV
columns reflect the choice without waiting for Generate. Same
treatment for Range-mode load unit selects.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add Range-mode branch to `validateInputs()`

**Files:**
- Modify: `doe-designer.html` (`validateInputs` around line 370)

- [ ] **Step 1: Add the Range branch**

Find the start of `validateInputs`:

```js
function validateInputs() {
  const errors = [];
  const warnings = [];
  const f = state.factors;
  const isCounts = state.inputMode === 'counts';

  if (isCounts) {
```

Replace with:

```js
function validateInputs() {
  const errors = [];
  const warnings = [];
  const f = state.factors;
  const isCounts = state.inputMode === 'counts';
  const isRange  = state.inputMode === 'range';

  if (isRange) {
    validateRangeFactors(f, errors);
  } else if (isCounts) {
```

(Note: `if (isCounts)` becomes `} else if (isCounts) {`. The closing `}` for the `if (isCounts)` block already exists below as part of the existing else-branch.)

- [ ] **Step 2: Add the `validateRangeFactors` helper above `validateInputs`**

Just **above** `function validateInputs()`, insert:

```js
/**
 * Range-mode factor validation. Pushes user-facing error strings into errors[].
 * Each factor must have both min and max as finite numbers with min <= max,
 * and within type-specific bounds.
 */
function validateRangeFactors(f, errors) {
  const checkBounds = (label, range, opts) => {
    const { min, max } = range;
    if (min === null || min === undefined || !Number.isFinite(min)) {
      errors.push(`${label}: please enter a numeric minimum.`);
      return;
    }
    if (max === null || max === undefined || !Number.isFinite(max)) {
      errors.push(`${label}: please enter a numeric maximum.`);
      return;
    }
    if (min > max) {
      errors.push(`${label}: minimum (${min}) must be ≤ maximum (${max}).`);
      return;
    }
    if (opts.absMin !== undefined && min < opts.absMin) {
      errors.push(`${label}: minimum ${min} is below the allowed lower bound ${opts.absMin}${opts.unit ? ' ' + opts.unit : ''}.`);
    }
    if (opts.absMax !== undefined && max > opts.absMax) {
      errors.push(`${label}: maximum ${max} is above the allowed upper bound ${opts.absMax}${opts.unit ? ' ' + opts.unit : ''}.`);
    }
  };

  checkBounds('Temperature', f.temperature.range, {
    absMin: TEMP_MIN_ABSOLUTE, absMax: TEMP_MAX_ABSOLUTE, unit: '°C',
  });
  checkBounds('Charge Load',    f.chargeLoad.range,    { absMin: 0 });
  checkBounds('Discharge Load', f.dischargeLoad.range, { absMin: 0 });

  const termOpts = type => {
    if (type === 'SOCmin' || type === 'SOCmax') return { absMin: 0, absMax: 100, unit: '%' };
    return { absMin: 0 };  // Voltage, Time, Energy/Charge Capacity: must be > 0; allow == 0 here, then warn below
  };

  const dRange = f.termination.range.discharge;
  const cRange = f.termination.range.charge;
  checkBounds(`Discharge Termination (${dRange.type})`, dRange, termOpts(dRange.type));
  checkBounds(`Charge Termination (${cRange.type})`,    cRange, termOpts(cRange.type));

  // Strict positivity check for non-SOC termination values
  const strictPos = type => type !== 'SOCmin' && type !== 'SOCmax';
  if (strictPos(dRange.type) && Number.isFinite(dRange.min) && dRange.min <= 0) {
    errors.push(`Discharge Termination (${dRange.type}): minimum must be > 0.`);
  }
  if (strictPos(cRange.type) && Number.isFinite(cRange.min) && cRange.min <= 0) {
    errors.push(`Charge Termination (${cRange.type}): minimum must be > 0.`);
  }
}
```

- [ ] **Step 3: Update the orthogonal active-count branch for Range mode**

Find the orthogonal validation block (around line 437–459):

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

Replace with:

```js
  if (state.method === 'orthogonal') {
    const M = state.methodParams.orthogonalSubdivisions;
    if (!Number.isInteger(M) || M < 2) {
      errors.push('Orthogonal Sampling: subdivisions per factor must be an integer ≥ 2.');
    } else {
      let activeCount;
      if (isRange) {
        const r = f.termination.range;
        activeCount = [
          [f.temperature.range.min,    f.temperature.range.max],
          [f.chargeLoad.range.min,     f.chargeLoad.range.max],
          [f.dischargeLoad.range.min,  f.dischargeLoad.range.max],
          [r.discharge.min,            r.discharge.max],
          [r.charge.min,               r.charge.max],
        ].filter(([lo, hi]) => Number.isFinite(lo) && Number.isFinite(hi) && lo < hi).length;
      } else {
        activeCount = [
          f.temperature.values.length,
          f.chargeLoad.values.length,
          f.dischargeLoad.values.length,
          f.termination.combinations.length,
        ].filter(len => len > 1).length;
      }
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

- [ ] **Step 4: Verify validation**

Reload, switch to **Range** mode. In DevTools:

```js
syncStateFromRangeDOM();
const v = validateInputs();
v.errors;     // []
v.warnings;   // []
```

Expected: empty arrays for the default Range inputs.

Now manually set Temperature max to `120`:

```js
syncStateFromRangeDOM();
validateInputs().errors;
// ["Temperature: maximum 120 is above the allowed upper bound 80 °C."]
```

Set Charge Load min to `5` and max to `2`:

```js
syncStateFromRangeDOM();
validateInputs().errors;
// includes "Charge Load: minimum (5) must be ≤ maximum (2)."
```

Restore inputs to defaults. Now select **Discharge Termination** type **SOCmin**, set its min to `-10`:

```js
syncStateFromRangeDOM();
validateInputs().errors;
// includes "Discharge Termination (SOCmin): minimum -10 is below the allowed lower bound 0 %."
```

Restore. Switch to **Counts** mode — the existing counts validation continues to work unchanged.

- [ ] **Step 5: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add Range-mode validation

Per-factor min/max numeric checks, ordering check, type-specific
absolute bounds (temperature [-20, 80], loads >= 0, SOC [0, 100],
strict positivity for Voltage/Time/Energy/Charge capacity).
Orthogonal active-factor count is now mode-aware.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Add `generateLHSContinuous` sampler

**Files:**
- Modify: `doe-designer.html` (insert after existing `generateLHS` around line 269)

- [ ] **Step 1: Insert `generateLHSContinuous`**

Just **above** the comment `// ── Validation ─────────────────────────────────────────────────────────────` (around line 368), insert:

```js
/**
 * Continuous LHS sampler used in Range mode. For each active factor
 * (range with min < max), shuffle [0..n-1] independently; sample i picks the
 * permuted stratum index s for that factor and uses its midpoint as the
 * value: lo + ((s + 0.5) / n) * (hi - lo). Held-constant factors (min == max)
 * emit that single value on every run.
 */
function generateLHSContinuous(factors, n) {
  const r = factors.termination.range;
  const dims = [
    { key: 'temperature',        lo: factors.temperature.range.min,    hi: factors.temperature.range.max    },
    { key: 'chargeLoad',         lo: factors.chargeLoad.range.min,     hi: factors.chargeLoad.range.max     },
    { key: 'dischargeLoad',      lo: factors.dischargeLoad.range.min,  hi: factors.dischargeLoad.range.max  },
    { key: 'dischargeTermValue', lo: r.discharge.min,                  hi: r.discharge.max                  },
    { key: 'chargeTermValue',    lo: r.charge.min,                     hi: r.charge.max                     },
  ];

  // Build per-dimension permutations only for active dims; held-constant dims need no permutation.
  const perms = dims.map(d => {
    const active = Number.isFinite(d.lo) && Number.isFinite(d.hi) && d.lo < d.hi;
    return active ? fisherYates(Array.from({ length: n }, (_, i) => i)) : null;
  });

  const samples = [];
  for (let i = 0; i < n; i++) {
    const row = {
      run:               i + 1,
      dischargeTermType: r.discharge.type,
      chargeTermType:    r.charge.type,
    };
    dims.forEach((d, k) => {
      if (perms[k] === null) {
        row[d.key] = d.lo;  // held constant (= hi)
      } else {
        const s = perms[k][i];
        const u = (s + 0.5) / n;
        row[d.key] = d.lo + u * (d.hi - d.lo);
      }
    });
    samples.push(row);
  }
  return samples;
}
```

- [ ] **Step 2: Verify with a console snippet**

Reload. In DevTools console, paste:

```js
// Synthetic factors with all 5 active dims
const fakeFactors = {
  temperature:   { range: { min: 10, max: 40 } },
  chargeLoad:    { range: { min: 1,  max: 4  }, unit: 'A' },
  dischargeLoad: { range: { min: 0,  max: 3  }, unit: 'A' },
  termination: {
    range: {
      discharge: { type: 'Voltage', min: 2.5, max: 4.0 },
      charge:    { type: 'Voltage', min: 2.5, max: 4.0 },
    },
  },
};
const out = generateLHSContinuous(fakeFactors, 6);
console.log('runs:', out.length);                         // 6
console.log('first run keys:', Object.keys(out[0]).sort());
// Expect: chargeLoad, chargeTermType, chargeTermValue, dischargeLoad,
//         dischargeTermType, dischargeTermValue, run, temperature
console.log('temps:', out.map(r => r.temperature).sort((a,b) => a - b));
// Expect: 6 distinct values, all of form 10 + ((s + 0.5) / 6) * 30
//         => 12.5, 17.5, 22.5, 27.5, 32.5, 37.5
console.log('term types:', out[0].dischargeTermType, out[0].chargeTermType);
// Expect: Voltage Voltage
```

Expected: 6 runs, the 6 sorted temperatures are exactly the six stratum midpoints `[12.5, 17.5, 22.5, 27.5, 32.5, 37.5]`. (Note: the *order* across runs is shuffled by the Fisher–Yates permutation, but the multiset is fixed.)

Now test held-constant:

```js
fakeFactors.dischargeLoad.range = { min: 2, max: 2 };  // pinned
const out2 = generateLHSContinuous(fakeFactors, 4);
console.log(out2.every(r => r.dischargeLoad === 2));  // true
```

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add generateLHSContinuous sampler

Standard Latin hypercube over five continuous factors using
stratum-midpoint values (u = (s + 0.5) / n). Held-constant
factors (min == max) emit the constant on every run; active
factors get an independent random permutation of strata.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Add `generateOrthogonalContinuous` sampler

**Files:**
- Modify: `doe-designer.html` (insert immediately after `generateLHSContinuous` from Task 9)

- [ ] **Step 1: Insert `generateOrthogonalContinuous`**

Immediately **after** the closing `}` of `generateLHSContinuous`, insert:

```js
/**
 * Continuous orthogonal sampler. Mirrors generateOrthogonal's bin assignment
 * over active dimensions, but maps the fine-bin index to a continuous value
 * via the bin midpoint: value = lo + ((bin + 0.5) / N) * (hi - lo).
 *
 * d = number of factors with min < max
 * N = M^d total runs, subBins = M^(d-1)
 */
function generateOrthogonalContinuous(factors, M) {
  const r = factors.termination.range;
  const dims = [
    { key: 'temperature',        lo: factors.temperature.range.min,    hi: factors.temperature.range.max    },
    { key: 'chargeLoad',         lo: factors.chargeLoad.range.min,     hi: factors.chargeLoad.range.max     },
    { key: 'dischargeLoad',      lo: factors.dischargeLoad.range.min,  hi: factors.dischargeLoad.range.max  },
    { key: 'dischargeTermValue', lo: r.discharge.min,                  hi: r.discharge.max                  },
    { key: 'chargeTermValue',    lo: r.charge.min,                     hi: r.charge.max                     },
  ];

  const activeIdxs = [];
  dims.forEach((d, i) => {
    if (Number.isFinite(d.lo) && Number.isFinite(d.hi) && d.lo < d.hi) activeIdxs.push(i);
  });
  const d = activeIdxs.length;

  // All factors pinned: emit a single run with each lo (== hi).
  if (d === 0) {
    const row = {
      run:               1,
      dischargeTermType: r.discharge.type,
      chargeTermType:    r.charge.type,
    };
    dims.forEach(dim => { row[dim.key] = dim.lo; });
    return [row];
  }

  const N       = Math.pow(M, d);
  const subBins = Math.pow(M, d - 1);

  // Enumerate M^d super-cells across active dims only
  const superCells = [];
  (function build(dim, cur) {
    if (dim === d) { superCells.push([...cur]); return; }
    for (let m = 0; m < M; m++) { cur[dim] = m; build(dim + 1, cur); }
  })(0, new Array(d));

  // For each active dim: assign each super-cell a unique fine-bin in
  // [m*subBins .. (m+1)*subBins). Preserves the LHS property.
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

  return superCells.map((_, i) => {
    const row = {
      run:               i + 1,
      dischargeTermType: r.discharge.type,
      chargeTermType:    r.charge.type,
    };
    dims.forEach((dim, fIdx) => {
      const activeDim = activeIdxs.indexOf(fIdx);
      if (activeDim === -1) {
        row[dim.key] = dim.lo;  // held constant
      } else {
        const bin = fineBins[activeDim][i];
        const u   = (bin + 0.5) / N;
        row[dim.key] = dim.lo + u * (dim.hi - dim.lo);
      }
    });
    return row;
  });
}
```

- [ ] **Step 2: Verify with a console snippet**

In DevTools, paste:

```js
const fakeFactors = {
  temperature:   { range: { min: 10, max: 40 } },
  chargeLoad:    { range: { min: 1,  max: 4  }, unit: 'A' },
  dischargeLoad: { range: { min: 0,  max: 3  }, unit: 'A' },
  termination: {
    range: {
      discharge: { type: 'Voltage', min: 2.5, max: 4.0 },
      charge:    { type: 'Voltage', min: 2.5, max: 4.0 },
    },
  },
};

// d = 5 (all active), M = 2 → N = 32
const out = generateOrthogonalContinuous(fakeFactors, 2);
console.log('runs:', out.length);              // 32

// Each sample's temperature should be one of the 32 stratum midpoints over [10, 40]:
//   bin in 0..31 → u = (bin + 0.5) / 32 → value = 10 + u * 30
// Sorting unique values should give all 32 distinct midpoints.
const uniqTemps = [...new Set(out.map(r => r.temperature.toFixed(6)))];
console.log('unique temps:', uniqTemps.length);  // 32
console.log('min temp:', Math.min(...out.map(r => r.temperature)).toFixed(4));  // ~10.4688
console.log('max temp:', Math.max(...out.map(r => r.temperature)).toFixed(4));  // ~39.5313
```

Expected: 32 runs, 32 unique temperature midpoints. Min ≈ `10.4688` (= 10 + 0.5/32 · 30), max ≈ `39.5313` (= 10 + 31.5/32 · 30).

Now pin one factor:

```js
fakeFactors.chargeLoad.range = { min: 2, max: 2 };
const out2 = generateOrthogonalContinuous(fakeFactors, 2);
console.log('runs:', out2.length);                        // 16  (d = 4, M^4)
console.log(out2.every(r => r.chargeLoad === 2));         // true
```

Pin all five:

```js
fakeFactors.temperature.range   = { min: 25, max: 25 };
fakeFactors.dischargeLoad.range = { min: 1,  max: 1  };
fakeFactors.termination.range.discharge = { type: 'Voltage', min: 3, max: 3 };
fakeFactors.termination.range.charge    = { type: 'Voltage', min: 4, max: 4 };
const out3 = generateOrthogonalContinuous(fakeFactors, 3);
console.log(out3);                                        // [{ run: 1, temperature: 25, chargeLoad: 2, ... }]
console.log(out3.length);                                 // 1
```

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add generateOrthogonalContinuous sampler

Mirrors generateOrthogonal over active dimensions but maps the
final fine-bin to a continuous value using (bin + 0.5) / N.
Held-constant factors emit their pinned value on every run.
Edge case d == 0 emits a single run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Wire generate dispatch to use continuous samplers in Range mode

**Files:**
- Modify: `doe-designer.html` (`runGeneration` / generate dispatch around line 519)

- [ ] **Step 1: Update the dispatch**

Find:

```js
  const f = state.factors;
  let runs;
  if (state.method === 'fullFactorial') {
    runs = generateFullFactorial(f);
  } else if (state.method === 'lhs') {
    runs = generateLHS(f, state.methodParams.samples);
  } else {
    runs = generateOrthogonal(f, state.methodParams.orthogonalSubdivisions);
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
  } else {
    runs = isRange
      ? generateOrthogonalContinuous(f, state.methodParams.orthogonalSubdivisions)
      : generateOrthogonal(f, state.methodParams.orthogonalSubdivisions);
  }
```

- [ ] **Step 2: Verify Generate produces Range-mode runs**

Reload. Switch to **Range** mode (LHS auto-selected). In DevTools:

```js
syncStateFromRangeDOM();
const out = generateLHSContinuous(state.factors, state.methodParams.samples);
console.log(out.length, Object.keys(out[0]).sort());
// 20 runs, keys: chargeLoad, chargeTermType, chargeTermValue, dischargeLoad,
//                dischargeTermType, dischargeTermValue, run, temperature
```

Now click the **Generate** button. The plot region/result table will likely **error or render nothing useful** because `getVarOptions`, `renderTable`, etc. don't yet know about Range mode (those tasks come next). That's expected at this stage. What we want to confirm:

```js
state.results.length;                       // 20
state.results[0].temperature;               // some number in [0, 50]
state.results[0].dischargeTermType;         // "Voltage"
```

If `state.results` is populated correctly, the dispatch is wired.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Dispatch to continuous samplers in Range mode

runGeneration now routes LHS and Orthogonal through their
continuous variants when inputMode is 'range', and through
the existing discrete samplers otherwise. Downstream
display still needs Range-mode branches — those follow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Update `countActiveOrthogonalFactors` for Range mode

**Files:**
- Modify: `doe-designer.html` (`countActiveOrthogonalFactors` around line 1174; hint generator around line 1218)

- [ ] **Step 1: Add Range branch to `countActiveOrthogonalFactors`**

Find:

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

Replace with:

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
      if (!el) return null;
      const raw = el.value.trim();
      if (raw === '') return null;
      const v = parseFloat(raw);
      return Number.isFinite(v) ? v : null;
    };
    const isActive = (loId, hiId) => {
      const lo = readNum(loId);
      const hi = readNum(hiId);
      return Number.isFinite(lo) && Number.isFinite(hi) && lo < hi;
    };
    let active = 0;
    if (isActive('input-range-temp-min',       'input-range-temp-max'))       active++;
    if (isActive('input-range-charge-min',     'input-range-charge-max'))     active++;
    if (isActive('input-range-discharge-min',  'input-range-discharge-max'))  active++;
    if (isActive('input-range-disch-term-min', 'input-range-disch-term-max')) active++;
    if (isActive('input-range-chg-term-min',   'input-range-chg-term-max'))   active++;
    return active;
  }

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

- [ ] **Step 2: Verify the orthogonal badge in Range mode**

Reload, switch to **Range** mode, click **Orthogonal Sampling** radio. Expected: the badge under the M input shows `M⁵ = 2⁵ = 32`. The hint at the bottom says `M^5 = 2^5 = 32 (5 varying factors)` (the existing `n === 4` special case for the superscript glyph doesn't fire — fallback string is used).

Now manually clear Charge Load max:

```js
// In the Charge Load max input, delete the value, then in console:
updateOrthogonalBadge();
```

Expected: badge updates to `M⁴ = 2⁴ = 16` (4 active factors) — clearing the max made `lo == hi` infeasible (max is null), so that factor is no longer active.

Increase M to 3: badge → `M⁴ = 3⁴ = 81`, and so on. (Actual numbers depend on which inputs are still valid.)

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Make orthogonal active-factor count Range-mode aware

countActiveOrthogonalFactors now reads min/max input pairs
in Range mode and counts factors with min < max as active.
The badge updates to M^d where d can be 0..5 in Range vs 0..4
in counts/values modes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Update `getVarOptions()` for Range mode

**Files:**
- Modify: `doe-designer.html` (`getVarOptions` around line 654)

- [ ] **Step 1: Add Range branch**

Find:

```js
function getVarOptions() {
  if (state.inputMode === 'counts') {
    return [
      { key: 'temperature',    label: 'Temperature level' },
      { key: 'chargeLoad',     label: 'Charge load level' },
      { key: 'dischargeLoad',  label: 'Discharge load level' },
      { key: 'termComboIndex', label: 'Termination level' },
    ];
  }
  const chargeUnit = state.factors.chargeLoad.unit;
  const dischUnit  = state.factors.dischargeLoad.unit;
  return [
    { key: 'temperature',    label: 'Temperature (°C)' },
    { key: 'chargeLoad',     label: `Charge Load (${chargeUnit})` },
    { key: 'dischargeLoad',  label: `Discharge Load (${dischUnit})` },
    { key: 'termComboIndex', label: 'Termination Combo' },
  ];
}
```

Replace with:

```js
function getVarOptions() {
  if (state.inputMode === 'counts') {
    return [
      { key: 'temperature',    label: 'Temperature level' },
      { key: 'chargeLoad',     label: 'Charge load level' },
      { key: 'dischargeLoad',  label: 'Discharge load level' },
      { key: 'termComboIndex', label: 'Termination level' },
    ];
  }
  if (state.inputMode === 'range') {
    const f          = state.factors;
    const chargeUnit = f.chargeLoad.unit;
    const dischUnit  = f.dischargeLoad.unit;
    const dType      = f.termination.range.discharge.type;
    const cType      = f.termination.range.charge.type;
    const dUnit      = TERMINATION_UNITS[dType] || '';
    const cUnit      = TERMINATION_UNITS[cType] || '';
    return [
      { key: 'temperature',        label: 'Temperature (°C)' },
      { key: 'chargeLoad',         label: `Charge Load (${chargeUnit})` },
      { key: 'dischargeLoad',      label: `Discharge Load (${dischUnit})` },
      { key: 'dischargeTermValue', label: `Discharge Term: ${dType} (${dUnit})` },
      { key: 'chargeTermValue',    label: `Charge Term: ${cType} (${cUnit})` },
    ];
  }
  const chargeUnit = state.factors.chargeLoad.unit;
  const dischUnit  = state.factors.dischargeLoad.unit;
  return [
    { key: 'temperature',    label: 'Temperature (°C)' },
    { key: 'chargeLoad',     label: `Charge Load (${chargeUnit})` },
    { key: 'dischargeLoad',  label: `Discharge Load (${dischUnit})` },
    { key: 'termComboIndex', label: 'Termination Combo' },
  ];
}
```

- [ ] **Step 2: Verify axis dropdowns include all 5 Range factors**

Reload, switch to **Range** mode, click **Generate**. In DevTools:

```js
[...document.getElementById('plot3d-x').options].map(o => o.text);
// ["Temperature (°C)", "Charge Load (A)", "Discharge Load (A)",
//  "Discharge Term: Voltage (V)", "Charge Term: Voltage (V)"]
```

Open the X / Y / Z dropdowns under the 3D plot — five options with the Range labels. The 2D plot dropdowns also show the five.

The 3D plot itself may render but with broken hover (term value keys exist on runs but `computePlotAxis` reads them via the generic `r[k]` path, so it works without changes — see below).

Confirm tooltip:

```js
// Hover any 3D point; tooltip should show e.g.
// Temperature (°C): 12.5
// Charge Load (A): 2.75
// Discharge Load (A): 0.625
// Run 1
```

Switch to **Counts** or **Exact values** — dropdowns return to their previous 4-factor lists.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Expose 5 Range-mode factors in plot axis options

getVarOptions returns five entries in Range mode (termination
splits into separate discharge and charge value axes). Labels
include the chosen termination type and its unit. computePlotAxis
already handles arbitrary numeric keys via r[k], so 3D and 2D
plots pick up the new axes without further changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Update `renderTable` for Range mode

**Files:**
- Modify: `doe-designer.html` (`renderTable` around line 589)

- [ ] **Step 1: Add Range branch**

Find:

```js
function renderTable(runs) {
  const f        = state.factors;
  const isCounts = state.inputMode === 'counts';

  let headers, getCells;

  if (isCounts) {
    headers = ['Run', 'Temperature', 'Charge Load', 'Discharge Load', 'Termination'];
    getCells = r => [r.run, r.temperature, r.chargeLoad, r.dischargeLoad, r.termComboIndex];
  } else {
    const chargeUnit = f.chargeLoad.unit;
    const dischUnit  = f.dischargeLoad.unit;
    headers = [
      'Run',
      'Temperature (°C)',
      `Charge Load (${chargeUnit})`,
      `Discharge Load (${dischUnit})`,
      'Disch. Term. Type',
      'Disch. Term. Value',
      'Chg. Term. Type',
      'Chg. Term. Value',
    ];
    getCells = r => {
      const du = TERMINATION_UNITS[r.termCombo.dischargeType];
      const cu = TERMINATION_UNITS[r.termCombo.chargeType];
      return [
        r.run,
        fmt(r.temperature),
        fmt(r.chargeLoad),
        fmt(r.dischargeLoad),
        r.termCombo.dischargeType,
        `${fmt(r.termCombo.dischargeValue)} ${du}`,
        r.termCombo.chargeType,
        `${fmt(r.termCombo.chargeValue)} ${cu}`,
      ];
    };
  }
```

Replace with:

```js
function renderTable(runs) {
  const f        = state.factors;
  const isCounts = state.inputMode === 'counts';
  const isRange  = state.inputMode === 'range';

  let headers, getCells;

  if (isCounts) {
    headers = ['Run', 'Temperature', 'Charge Load', 'Discharge Load', 'Termination'];
    getCells = r => [r.run, r.temperature, r.chargeLoad, r.dischargeLoad, r.termComboIndex];
  } else if (isRange) {
    const chargeUnit = f.chargeLoad.unit;
    const dischUnit  = f.dischargeLoad.unit;
    const dType      = f.termination.range.discharge.type;
    const cType      = f.termination.range.charge.type;
    const dUnit      = TERMINATION_UNITS[dType] || '';
    const cUnit      = TERMINATION_UNITS[cType] || '';
    headers = [
      'Run',
      'Temperature (°C)',
      `Charge Load (${chargeUnit})`,
      `Discharge Load (${dischUnit})`,
      `Discharge Term (${dType}, ${dUnit})`,
      `Charge Term (${cType}, ${cUnit})`,
    ];
    getCells = r => [
      r.run,
      fmt(r.temperature),
      fmt(r.chargeLoad),
      fmt(r.dischargeLoad),
      fmt(r.dischargeTermValue),
      fmt(r.chargeTermValue),
    ];
  } else {
    const chargeUnit = f.chargeLoad.unit;
    const dischUnit  = f.dischargeLoad.unit;
    headers = [
      'Run',
      'Temperature (°C)',
      `Charge Load (${chargeUnit})`,
      `Discharge Load (${dischUnit})`,
      'Disch. Term. Type',
      'Disch. Term. Value',
      'Chg. Term. Type',
      'Chg. Term. Value',
    ];
    getCells = r => {
      const du = TERMINATION_UNITS[r.termCombo.dischargeType];
      const cu = TERMINATION_UNITS[r.termCombo.chargeType];
      return [
        r.run,
        fmt(r.temperature),
        fmt(r.chargeLoad),
        fmt(r.dischargeLoad),
        r.termCombo.dischargeType,
        `${fmt(r.termCombo.dischargeValue)} ${du}`,
        r.termCombo.chargeType,
        `${fmt(r.termCombo.chargeValue)} ${cu}`,
      ];
    };
  }
```

- [ ] **Step 2: Verify table renders in Range mode**

Reload. Range mode → Generate. Expected: results table shows 6 columns (`Run | Temperature (°C) | Charge Load (A) | Discharge Load (A) | Discharge Term (Voltage, V) | Charge Term (Voltage, V)`) with 20 rows of numeric values, all within the input bounds.

Switch to **Counts** mode and Generate — table returns to existing 5-column counts layout. Switch to **Exact values**, add some values, Generate — table returns to existing 8-column values layout.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Render Range-mode results table

Six columns: Run + Temperature + Charge Load + Discharge Load
+ Discharge Term + Charge Term. Term columns include the chosen
type and unit in the header (e.g. 'Discharge Term (Voltage, V)')
and just the numeric value in cells.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Update `renderParCoords` for Range mode

**Files:**
- Modify: `doe-designer.html` (`renderParCoords` around line 858)

- [ ] **Step 1: Add Range branch**

Find:

```js
function renderParCoords(runs) {
  const f        = state.factors;
  const isCounts = state.inputMode === 'counts';

  // Colour lines by run number for easy visual separation
  const runNums = runs.map(r => r.run);
  const nRuns   = runs.length;

  let dimensions;

  if (isCounts) {
    dimensions = [
      { label: 'Temperature',    values: runs.map(r => r.temperature)    },
      { label: 'Charge Load',    values: runs.map(r => r.chargeLoad)     },
      { label: 'Discharge Load', values: runs.map(r => r.dischargeLoad)  },
      { label: 'Termination',    values: runs.map(r => r.termComboIndex) },
    ];
  } else {
    const chargeUnit = f.chargeLoad.unit;
    const dischUnit  = f.dischargeLoad.unit;

    // Build combo tick maps for the termination axis
    const combos       = f.termination.combinations;
    const comboIndices = runs.map(r => r.termComboIndex);
    const uniqueIdx    = [...new Set(comboIndices)].sort((a, b) => a - b);
    const ticktext     = uniqueIdx.map(i => {
      const c = combos[i - 1];
      return c ? comboLabel(c) : `Combo ${i}`;
    });

    dimensions = [
      { label: 'Temperature (°C)',              values: runs.map(r => r.temperature)    },
      { label: `Charge Load (${chargeUnit})`,   values: runs.map(r => r.chargeLoad)     },
      { label: `Discharge Load (${dischUnit})`, values: runs.map(r => r.dischargeLoad)  },
      { label: 'Term. Combo',                   values: comboIndices, tickvals: uniqueIdx, ticktext },
    ];
  }
```

Replace with:

```js
function renderParCoords(runs) {
  const f        = state.factors;
  const isCounts = state.inputMode === 'counts';
  const isRange  = state.inputMode === 'range';

  // Colour lines by run number for easy visual separation
  const runNums = runs.map(r => r.run);
  const nRuns   = runs.length;

  let dimensions;

  if (isCounts) {
    dimensions = [
      { label: 'Temperature',    values: runs.map(r => r.temperature)    },
      { label: 'Charge Load',    values: runs.map(r => r.chargeLoad)     },
      { label: 'Discharge Load', values: runs.map(r => r.dischargeLoad)  },
      { label: 'Termination',    values: runs.map(r => r.termComboIndex) },
    ];
  } else if (isRange) {
    const chargeUnit = f.chargeLoad.unit;
    const dischUnit  = f.dischargeLoad.unit;
    const dType      = f.termination.range.discharge.type;
    const cType      = f.termination.range.charge.type;
    const dUnit      = TERMINATION_UNITS[dType] || '';
    const cUnit      = TERMINATION_UNITS[cType] || '';
    dimensions = [
      { label: 'Temperature (°C)',                values: runs.map(r => r.temperature)        },
      { label: `Charge Load (${chargeUnit})`,     values: runs.map(r => r.chargeLoad)         },
      { label: `Discharge Load (${dischUnit})`,   values: runs.map(r => r.dischargeLoad)      },
      { label: `Disch. Term ${dType} (${dUnit})`, values: runs.map(r => r.dischargeTermValue) },
      { label: `Chg. Term ${cType} (${cUnit})`,   values: runs.map(r => r.chargeTermValue)    },
    ];
  } else {
    const chargeUnit = f.chargeLoad.unit;
    const dischUnit  = f.dischargeLoad.unit;

    // Build combo tick maps for the termination axis
    const combos       = f.termination.combinations;
    const comboIndices = runs.map(r => r.termComboIndex);
    const uniqueIdx    = [...new Set(comboIndices)].sort((a, b) => a - b);
    const ticktext     = uniqueIdx.map(i => {
      const c = combos[i - 1];
      return c ? comboLabel(c) : `Combo ${i}`;
    });

    dimensions = [
      { label: 'Temperature (°C)',              values: runs.map(r => r.temperature)    },
      { label: `Charge Load (${chargeUnit})`,   values: runs.map(r => r.chargeLoad)     },
      { label: `Discharge Load (${dischUnit})`, values: runs.map(r => r.dischargeLoad)  },
      { label: 'Term. Combo',                   values: comboIndices, tickvals: uniqueIdx, ticktext },
    ];
  }
```

- [ ] **Step 2: Verify parcoords**

Reload, Range mode, Generate. Expected: parallel coordinates plot shows 5 axes (Temperature, Charge Load, Discharge Load, Disch. Term Voltage, Chg. Term Voltage). Brushing on any axis filters the lines as in other modes. Click on a line to highlight a single run — the parcoords click-to-highlight feature still works.

Switch back to Counts/Exact values modes and Generate — 4 axes return.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Render 5-axis parallel coordinates in Range mode

All five Range factors (temperature, charge load, discharge load,
discharge term, charge term) become numeric parcoords axes; no
combo tick-array special-casing needed. Brushing and click-to-
highlight continue to work across the new axis count.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Update `downloadCSV` for Range mode

**Files:**
- Modify: `doe-designer.html` (`downloadCSV` around line 1055)

- [ ] **Step 1: Add Range branch**

Find:

```js
function downloadCSV() {
  if (!state.results) return;
  const f        = state.factors;
  const isCounts = state.inputMode === 'counts';

  let header, makeRow;

  if (isCounts) {
    header  = ['Run', 'TemperatureLevel', 'ChargeLoadLevel', 'DischargeLoadLevel', 'TerminationLevel'].join(',');
    makeRow = r => [r.run, r.temperature, r.chargeLoad, r.dischargeLoad, r.termComboIndex].join(',');
  } else {
```

Replace with:

```js
function downloadCSV() {
  if (!state.results) return;
  const f        = state.factors;
  const isCounts = state.inputMode === 'counts';
  const isRange  = state.inputMode === 'range';

  let header, makeRow;

  if (isCounts) {
    header  = ['Run', 'TemperatureLevel', 'ChargeLoadLevel', 'DischargeLoadLevel', 'TerminationLevel'].join(',');
    makeRow = r => [r.run, r.temperature, r.chargeLoad, r.dischargeLoad, r.termComboIndex].join(',');
  } else if (isRange) {
    const chargeUnit = f.chargeLoad.unit;
    const dischUnit  = f.dischargeLoad.unit;
    const dType      = f.termination.range.discharge.type;
    const cType      = f.termination.range.charge.type;
    const dUnit      = TERMINATION_UNITS[dType] || '';
    const cUnit      = TERMINATION_UNITS[cType] || '';
    header = [
      'Run',
      'Temperature_degC',
      `ChargeLoad_${chargeUnit}`,
      `DischargeLoad_${dischUnit}`,
      'DischargeTermType',
      `DischargeTermValue_${dUnit}`,
      'ChargeTermType',
      `ChargeTermValue_${cUnit}`,
    ].join(',');
    makeRow = r => [
      r.run,
      r.temperature,
      r.chargeLoad,
      r.dischargeLoad,
      r.dischargeTermType,
      r.dischargeTermValue,
      r.chargeTermType,
      r.chargeTermValue,
    ].join(',');
  } else {
```

(The trailing `} else {` of the original code stays — this just adds the `else if (isRange)` branch in front of it.)

- [ ] **Step 2: Verify CSV download**

Reload, Range mode, Generate, click **Download CSV**. Open the downloaded file. Expected first line:

```
Run,Temperature_degC,ChargeLoad_A,DischargeLoad_A,DischargeTermType,DischargeTermValue_V,ChargeTermType,ChargeTermValue_V
```

Each subsequent row has 8 comma-separated fields, e.g.:

```
1,12.5,2.75,0.625,Voltage,3.075,Voltage,2.575
```

Numeric values land within the input bounds. Switch the discharge termination dropdown to **Time**, regenerate, download — the header now shows `DischargeTermType,DischargeTermValue_s` and rows have time-style values.

Switch to Counts mode and Generate — CSV reverts to the existing 5-column counts schema.

- [ ] **Step 3: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Add Range-mode CSV schema

Eight-column download mirrors the Exact-values output (Run +
Temperature + Charge Load + Discharge Load + 4 termination
columns). Type labels and per-side units appear in the header
so downstream consumers see a uniform shape across the two
continuous-output modes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Switch defaults to Range mode and LHS

**Files:**
- Modify: `doe-designer.html` (state literal around line 30; mode toggle button classes around line 2179; method radio `checked` attribute around line 2312)

- [ ] **Step 1: Update state defaults**

In the `state` literal, find:

```js
  method: 'fullFactorial',
  methodParams: {
    samples:                20,
    orthogonalSubdivisions: 2,
  },
  repeats:        1,
  inputMode:      'counts',
```

Replace with:

```js
  method: 'lhs',
  methodParams: {
    samples:                20,
    orthogonalSubdivisions: 2,
  },
  repeats:        1,
  inputMode:      'range',
```

- [ ] **Step 2: Move the `active` class onto the Range button**

Find:

```html
      <div class="mode-toggle" role="tablist" aria-label="Input mode">
        <button type="button" class="mode-btn" data-mode="range" role="tab">Range</button>
        <button type="button" class="mode-btn active" data-mode="counts" role="tab">Level counts</button>
        <button type="button" class="mode-btn" data-mode="values" role="tab">Exact values</button>
      </div>
```

Replace with:

```html
      <div class="mode-toggle" role="tablist" aria-label="Input mode">
        <button type="button" class="mode-btn active" data-mode="range" role="tab">Range</button>
        <button type="button" class="mode-btn" data-mode="counts" role="tab">Level counts</button>
        <button type="button" class="mode-btn" data-mode="values" role="tab">Exact values</button>
      </div>
```

- [ ] **Step 3: Show the Range panel by default and hide the Counts panel**

Find:

```html
      <!-- ── Range mode ── -->
      <div id="mode-range" class="hidden">
```

Replace with:

```html
      <!-- ── Range mode ── -->
      <div id="mode-range">
```

Find:

```html
      <!-- ── Level-counts mode ── -->
      <div id="mode-counts">
```

Replace with:

```html
      <!-- ── Level-counts mode ── -->
      <div id="mode-counts" class="hidden">
```

- [ ] **Step 4: Move the `checked` attribute from Full Factorial to LHS**

Find:

```html
          <input type="radio" name="doe-method" id="radio-fullFactorial" value="fullFactorial" checked />
```

Replace with:

```html
          <input type="radio" name="doe-method" id="radio-fullFactorial" value="fullFactorial" />
```

Find:

```html
          <input type="radio" name="doe-method" id="radio-lhs" value="lhs" />
```

Replace with:

```html
          <input type="radio" name="doe-method" id="radio-lhs" value="lhs" checked />
```

- [ ] **Step 5: Show the LHS extras by default and hide Full Factorial extras**

Find:

```html
        <div class="method-extra" id="extra-fullFactorial">
```

Replace with:

```html
        <div class="method-extra hidden" id="extra-fullFactorial">
```

Find:

```html
        <div class="method-extra hidden" id="extra-lhs">
```

Replace with:

```html
        <div class="method-extra" id="extra-lhs">
```

- [ ] **Step 6: Verify the new defaults end-to-end**

Reload the page. Expected:

1. **Range** button is highlighted (`active`); Range panel is visible; Counts and Values panels are hidden.
2. The **Latin Hypercube Sampling** radio is checked; its "Number of samples" input (default 20) is visible.
3. **Full Factorial** card is greyed out with the hint "Available in Level counts and Exact values modes."
4. **Orthogonal Sampling** is enabled but unchecked.
5. Click **Generate** — 20 runs appear in the results table with the 6 Range-mode columns; the 3D and 2D plots render against five-factor axes; the parallel coordinates plot has 5 axes; the CSV download has the 8-column Range schema.
6. Click **Level counts** — Counts panel appears, Full Factorial auto-selected and enabled, LHS/Orthogonal greyed out. Click **Generate** — existing Counts behaviour: 3×3×3×2 = 54 runs.
7. Click back to **Range** — the Range inputs you typed are preserved (mode-switching keeps both data branches alive).

- [ ] **Step 7: Commit**

```bash
git add doe-designer.html
git commit -m "$(cat <<'EOF'
Default to Range mode with LHS

inputMode initialises to 'range', method initialises to 'lhs'.
Range panel and LHS extras start visible; Counts panel and
Full Factorial extras start hidden. Mode toggle and method
radio markup updated to match.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

**Spec coverage verified:**

- Mode toggle order + default — Tasks 3, 17
- Range-mode panel — Task 2
- Disabled-method visual + auto-reselect — Task 5
- State shape — Tasks 1, 17
- Mode-method coupling — Tasks 4, 5
- Continuous LHS sampler — Task 9
- Continuous Orthogonal sampler — Task 10
- Generate dispatch — Task 11
- Run output schema — implicit in Tasks 9–10
- Validation — Task 8
- Active-factor count — Task 12
- `getVarOptions` — Task 13
- 3D / 2D plot axes — Task 13 (existing `populateAxisSelects` + `computePlotAxis` generalise; no separate task needed)
- Results table — Task 14
- Parcoords — Task 15
- CSV — Task 16

**Naming consistency:** the same five output keys (`temperature`, `chargeLoad`, `dischargeLoad`, `dischargeTermValue`, `chargeTermValue`) are used by samplers in Tasks 9–10, plot lookup in Task 13, table in Task 14, parcoords in Task 15, and CSV in Task 16. Type fields `dischargeTermType` and `chargeTermType` are emitted as constants per generation by both samplers and consumed by the table/CSV.

**ID consistency:** input element IDs follow the pattern `input-range-<factor>-<bound>` and are used in:
- Task 2 (HTML)
- Task 6 (DOM-to-state sync)
- Task 7 (live unit updates)
- Task 12 (active-factor count for badge)

All references match.

**Edge cases handled:**
- Blank min/max inputs become `null` and are surfaced as validation errors (Task 8)
- `min == max` is allowed and treated as held constant by both samplers and validation (Tasks 8, 9, 10, 12)
- Edge case `d == 0` (all five factors pinned) emits a single run from the orthogonal sampler (Task 10)
- Mode switch with current method invalid → auto-reselect a sensible default (Task 5)
- Per-mode data persistence via additive state shape (Tasks 1, 17)
