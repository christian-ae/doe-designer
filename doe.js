'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const TEMP_MIN_ABSOLUTE = -20;
const TEMP_MAX_ABSOLUTE = 80;

const TERMINATION_UNITS = {
  'Voltage':          'V',
  'Time':             'h',
  'Energy Capacity':  'Wh',
  'Charge Capacity':  'Ah',
};

const TERMINATION_TYPES = Object.keys(TERMINATION_UNITS);

// Standard Taguchi L8 (8 runs × 7 columns, values 1–2; use columns 0–3 for 4 factors)
const L8 = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 2, 2, 2, 2],
  [1, 2, 2, 1, 1, 2, 2],
  [1, 2, 2, 2, 2, 1, 1],
  [2, 1, 2, 1, 2, 1, 2],
  [2, 1, 2, 2, 1, 2, 1],
  [2, 2, 1, 1, 2, 2, 1],
  [2, 2, 1, 2, 1, 1, 2],
];

// Standard Taguchi L9 (9 runs × 4 columns, values 1–3)
const L9 = [
  [1, 1, 1, 1],
  [1, 2, 2, 2],
  [1, 3, 3, 3],
  [2, 1, 2, 3],
  [2, 2, 3, 1],
  [2, 3, 1, 2],
  [3, 1, 3, 2],
  [3, 2, 1, 3],
  [3, 3, 2, 1],
];

// ── Application state ──────────────────────────────────────────────────────
const state = {
  factors: {
    temperature:   { values: [] },
    chargeLoad:    { values: [], unit: 'A' },
    dischargeLoad: { values: [], unit: 'A' },
    // Each combo: { dischargeType, dischargeValue, chargeType, chargeValue }
    termination:   { combinations: [] },
  },
  method: 'fullFactorial',
  methodParams: {
    samples:       20,
    taguchiLevels: 2,
  },
  results: null,
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse a comma-separated string into a sorted, deduplicated array of numbers.
 * Returns { values: number[], hadDuplicates: boolean, invalid: boolean }.
 */
function parseValueList(str) {
  if (!str || !str.trim()) {
    return { values: [], hadDuplicates: false, invalid: true };
  }
  const parts = str.split(',').map(s => s.trim()).filter(s => s !== '');
  const nums = parts.map(s => parseFloat(s));
  if (nums.some(n => isNaN(n))) {
    return { values: [], hadDuplicates: false, invalid: true };
  }
  const unique = [...new Set(nums)].sort((a, b) => a - b);
  return {
    values:        unique,
    hadDuplicates: unique.length < nums.length,
    invalid:       false,
  };
}

/** Fisher-Yates shuffle (in-place, returns array). */
function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Format a number to at most 4 significant figures, stripping trailing zeros. */
function fmt(n) {
  return parseFloat(n.toPrecision(4)).toString();
}

/** Short human-readable label for a termination combo. */
function comboLabel(combo) {
  const du = TERMINATION_UNITS[combo.dischargeType];
  const cu = TERMINATION_UNITS[combo.chargeType];
  return `D: ${fmt(combo.dischargeValue)} ${du} / C: ${fmt(combo.chargeValue)} ${cu}`;
}

// ── Termination combination builder ───────────────────────────────────────

/**
 * Create and append one combo row to #term-combo-list.
 * combo: { dischargeType, dischargeValue, chargeType, chargeValue } (defaults to Voltage / '' / Voltage / '')
 */
function addComboRow(combo) {
  combo = combo || {
    dischargeType: 'Voltage', dischargeValue: '',
    chargeType:    'Voltage', chargeValue:    '',
  };

  const list = document.getElementById('term-combo-list');
  const row  = document.createElement('div');
  row.className = 'term-combo-row';

  // Index label (will be updated by renumberCombos)
  const idx = document.createElement('span');
  idx.className = 'combo-index';
  idx.textContent = list.children.length + 1;

  const makeCell = (typeVal, numVal) => {
    const cell = document.createElement('div');
    cell.className = 'term-combo-cell';

    const sel = document.createElement('select');
    sel.className = 'unit-select combo-type-sel';
    TERMINATION_TYPES.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === typeVal) opt.selected = true;
      sel.appendChild(opt);
    });

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = 'any';
    inp.className = 'factor-input combo-val-inp';
    inp.placeholder = 'value';
    if (numVal !== '' && numVal !== null && numVal !== undefined) inp.value = numVal;

    const unit = document.createElement('span');
    unit.className = 'unit-label combo-unit-lbl';
    unit.textContent = TERMINATION_UNITS[typeVal];

    sel.addEventListener('change', () => {
      unit.textContent = TERMINATION_UNITS[sel.value];
    });

    cell.appendChild(sel);
    cell.appendChild(inp);
    cell.appendChild(unit);
    return cell;
  };

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-remove-combo';
  removeBtn.title = 'Remove combination';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => {
    row.remove();
    renumberCombos();
  });

  row.appendChild(idx);
  row.appendChild(makeCell(combo.dischargeType, combo.dischargeValue));
  row.appendChild(makeCell(combo.chargeType,    combo.chargeValue));
  row.appendChild(removeBtn);

  list.appendChild(row);
}

function renumberCombos() {
  document.querySelectorAll('.term-combo-row .combo-index').forEach((el, i) => {
    el.textContent = i + 1;
  });
}

/** Read all combo rows from the DOM into state.factors.termination.combinations. */
function syncCombosFromDOM() {
  const rows = document.querySelectorAll('.term-combo-row');
  state.factors.termination.combinations = Array.from(rows).map(row => {
    const cells = row.querySelectorAll('.term-combo-cell');
    const dSel  = cells[0].querySelector('.combo-type-sel');
    const dInp  = cells[0].querySelector('.combo-val-inp');
    const cSel  = cells[1].querySelector('.combo-type-sel');
    const cInp  = cells[1].querySelector('.combo-val-inp');
    return {
      dischargeType:  dSel.value,
      dischargeValue: parseFloat(dInp.value),
      chargeType:     cSel.value,
      chargeValue:    parseFloat(cInp.value),
    };
  });
}

// ── DoE Generation ─────────────────────────────────────────────────────────

function generateFullFactorial(factors) {
  const lists = [
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

  return runs.map((r, i) => ({
    run:            i + 1,
    temperature:    r[0],
    chargeLoad:     r[1],
    dischargeLoad:  r[2],
    termCombo:      r[3],
    termComboIndex: factors.termination.combinations.indexOf(r[3]) + 1,
  }));
}

function generateLHS(factors, n) {
  const numericLists = [
    factors.temperature.values,
    factors.chargeLoad.values,
    factors.dischargeLoad.values,
  ];
  const combos = factors.termination.combinations;

  const perms = [...numericLists, combos].map(
    () => fisherYates(Array.from({ length: n }, (_, i) => i))
  );

  const samples = [];
  for (let i = 0; i < n; i++) {
    const strataFn = (list, k) => {
      const stratum = perms[k][i];
      const u = (stratum + Math.random()) / n;
      return Math.min(Math.floor(u * list.length), list.length - 1);
    };

    const tIdx = strataFn(numericLists[0], 0);
    const cIdx = strataFn(numericLists[1], 1);
    const dIdx = strataFn(numericLists[2], 2);
    const tcIdx = strataFn(combos, 3);

    samples.push({
      run:            i + 1,
      temperature:    numericLists[0][tIdx],
      chargeLoad:     numericLists[1][cIdx],
      dischargeLoad:  numericLists[2][dIdx],
      termCombo:      combos[tcIdx],
      termComboIndex: tcIdx + 1,
    });
  }
  return samples;
}

function generateTaguchi(factors, levels) {
  const array = levels === 2 ? L8 : L9;
  const lists = [
    factors.temperature.values,
    factors.chargeLoad.values,
    factors.dischargeLoad.values,
    factors.termination.combinations,
  ];

  return array.map((row, i) => {
    const comboIdx = row[3] - 1;
    return {
      run:            i + 1,
      temperature:    lists[0][row[0] - 1],
      chargeLoad:     lists[1][row[1] - 1],
      dischargeLoad:  lists[2][row[2] - 1],
      termCombo:      lists[3][comboIdx],
      termComboIndex: comboIdx + 1,
    };
  });
}

// ── Validation ─────────────────────────────────────────────────────────────

function validateInputs() {
  const errors = [];
  const warnings = [];
  const f = state.factors;

  // Temperature
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

  // Termination combinations
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

  // Method-specific
  if (state.method === 'lhs') {
    const n = state.methodParams.samples;
    if (!Number.isInteger(n) || n < 2) {
      errors.push('LHS: number of samples must be an integer ≥ 2.');
    }
  }

  if (state.method === 'taguchi') {
    const L = state.methodParams.taguchiLevels;
    const factorNames = ['Temperature', 'Charge Load', 'Discharge Load', 'Termination Combinations'];
    const factorLengths = [
      f.temperature.values.length,
      f.chargeLoad.values.length,
      f.dischargeLoad.values.length,
      f.termination.combinations.length,
    ];
    factorLengths.forEach((len, i) => {
      if (len < L) {
        errors.push(
          `${factorNames[i]}: needs at least ${L} entries for Taguchi ${L}-level design (has ${len}).`
        );
      }
    });
  }

  if (state.method === 'fullFactorial') {
    const lengths = [
      f.temperature.values.length,
      f.chargeLoad.values.length,
      f.dischargeLoad.values.length,
      f.termination.combinations.length,
    ];
    if (lengths.every(l => l > 0)) {
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

  return { errors, warnings };
}

// ── Dispatcher ─────────────────────────────────────────────────────────────

function validateAndGenerate() {
  syncStateFromDOM();

  const { errors, warnings } = validateInputs();
  const errContainer = document.getElementById('validation-errors');
  errContainer.innerHTML = '';

  if (warnings.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'warning-list';
    warnings.forEach(w => {
      const li = document.createElement('li');
      li.textContent = w;
      ul.appendChild(li);
    });
    errContainer.appendChild(ul);
  }

  if (errors.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'error-list';
    errors.forEach(e => {
      const li = document.createElement('li');
      li.textContent = e;
      ul.appendChild(li);
    });
    errContainer.appendChild(ul);
    return;
  }

  const f = state.factors;
  let runs;
  if (state.method === 'fullFactorial') {
    runs = generateFullFactorial(f);
  } else if (state.method === 'lhs') {
    runs = generateLHS(f, state.methodParams.samples);
  } else {
    runs = generateTaguchi(f, state.methodParams.taguchiLevels);
  }

  state.results = runs;

  document.getElementById('results').classList.remove('hidden');

  const methodLabels = {
    fullFactorial: 'Full Factorial',
    lhs:           'Latin Hypercube Sampling',
    taguchi:       `Taguchi ${state.methodParams.taguchiLevels}-level (${state.methodParams.taguchiLevels === 2 ? 'L8' : 'L9'})`,
  };
  document.getElementById('results-summary').textContent =
    `${runs.length} run${runs.length !== 1 ? 's' : ''} · ${methodLabels[state.method]}`;

  renderTable(runs);
  renderPlots(runs);
  renderParCoords(runs);

  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Table rendering ────────────────────────────────────────────────────────

function renderTable(runs) {
  const f = state.factors;
  const chargeUnit = f.chargeLoad.unit;
  const dischUnit  = f.dischargeLoad.unit;

  const headers = [
    'Run',
    'Temperature (°C)',
    `Charge Load (${chargeUnit})`,
    `Discharge Load (${dischUnit})`,
    'Disch. Term. Type',
    'Disch. Term. Value',
    'Chg. Term. Type',
    'Chg. Term. Value',
  ];

  const thead = document.getElementById('doe-thead');
  const tbody = document.getElementById('doe-tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const tr = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    tr.appendChild(th);
  });
  thead.appendChild(tr);

  runs.forEach(r => {
    const row = document.createElement('tr');
    const du = TERMINATION_UNITS[r.termCombo.dischargeType];
    const cu = TERMINATION_UNITS[r.termCombo.chargeType];

    const cells = [
      r.run,
      fmt(r.temperature),
      fmt(r.chargeLoad),
      fmt(r.dischargeLoad),
      r.termCombo.dischargeType,
      `${fmt(r.termCombo.dischargeValue)} ${du}`,
      r.termCombo.chargeType,
      `${fmt(r.termCombo.chargeValue)} ${cu}`,
    ];

    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (i === 0) td.style.textAlign = 'center';
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
}

// ── Plot rendering ─────────────────────────────────────────────────────────

function renderPlots(runs) {
  const f = state.factors;
  const chargeUnit = f.chargeLoad.unit;
  const dischUnit  = f.dischargeLoad.unit;

  const temps      = runs.map(r => r.temperature);
  const charge     = runs.map(r => r.chargeLoad);
  const disch      = runs.map(r => r.dischargeLoad);
  const termIdx = runs.map(r => r.termComboIndex);
  const runNums = runs.map(r => `Run ${r.run}`);

  const makeTrace = (x, y, xLabel, yLabel, customText) => ({
    x,
    y,
    mode:  'markers',
    type:  'scatter',
    text:  customText || runNums,
    hovertemplate: `${xLabel}: <b>%{x}</b><br>${yLabel}: <b>%{y}</b><br><i>%{text}</i><extra></extra>`,
    marker: {
      size:    8,
      color:   '#2563eb',
      opacity: 0.75,
      line:    { width: 1, color: '#1d4ed8' },
    },
  });

  const layout = (xTitle, yTitle, extra) => Object.assign({
    xaxis:  { title: { text: xTitle, font: { size: 12 } }, automargin: true },
    yaxis:  { title: { text: yTitle, font: { size: 12 } }, automargin: true },
    margin: { t: 16, r: 16, b: 50, l: 60 },
    autosize: true,
    paper_bgcolor: '#ffffff',
    plot_bgcolor:  '#f8fafc',
  }, extra || {});

  const config = { responsive: true, displayModeBar: false };

  // Plot 1: Temp vs Charge Load
  Plotly.react('plot-temp-charge',
    [makeTrace(temps, charge, 'Temperature (°C)', `Charge Load (${chargeUnit})`)],
    layout('Temperature (°C)', `Charge Load (${chargeUnit})`), config);

  // Plot 2: Temp vs Discharge Load
  Plotly.react('plot-temp-discharge',
    [makeTrace(temps, disch, 'Temperature (°C)', `Discharge Load (${dischUnit})`)],
    layout('Temperature (°C)', `Discharge Load (${dischUnit})`), config);

  // Plot 3: Discharge vs Charge Load
  Plotly.react('plot-discharge-charge',
    [makeTrace(disch, charge, `Discharge Load (${dischUnit})`, `Charge Load (${chargeUnit})`)],
    layout(`Discharge Load (${dischUnit})`, `Charge Load (${chargeUnit})`), config);

  // Plot 4: Temp vs Termination — y-axis is combo index; hover shows combo label
  // Build unique combo tick labels for y-axis
  const uniqueIndices  = [...new Set(termIdx)].sort((a, b) => a - b);
  const uniqueLabels   = uniqueIndices.map(idx => {
    const combo = f.termination.combinations[idx - 1];
    return combo ? comboLabel(combo) : `Combo ${idx}`;
  });

  const termHover = runs.map(r => `Run ${r.run}<br>${comboLabel(r.termCombo)}`);

  Plotly.react('plot-temp-term',
    [{
      x:    temps,
      y:    termIdx,
      mode: 'markers',
      type: 'scatter',
      text: termHover,
      hovertemplate: 'Temp: <b>%{x} °C</b><br>%{text}<extra></extra>',
      marker: { size: 8, color: '#2563eb', opacity: 0.75, line: { width: 1, color: '#1d4ed8' } },
    }],
    layout('Temperature (°C)', 'Termination Combo', {
      yaxis: {
        title:     { text: 'Termination Combo', font: { size: 12 } },
        tickmode:  'array',
        tickvals:  uniqueIndices,
        ticktext:  uniqueLabels,
        automargin: true,
      },
    }),
    config
  );
}

// ── Parallel coordinates plot ──────────────────────────────────────────────

function renderParCoords(runs) {
  const f = state.factors;
  const chargeUnit = f.chargeLoad.unit;
  const dischUnit  = f.dischargeLoad.unit;

  // Build combo tick maps for the termination axis
  const combos       = f.termination.combinations;
  const comboIndices = runs.map(r => r.termComboIndex);
  const uniqueIdx    = [...new Set(comboIndices)].sort((a, b) => a - b);
  const tickvals     = uniqueIdx;
  const ticktext     = uniqueIdx.map(i => {
    const c = combos[i - 1];
    return c ? comboLabel(c) : `Combo ${i}`;
  });

  // Colour lines by run number for easy visual separation
  const runNums = runs.map(r => r.run);
  const nRuns   = runs.length;

  const dimensions = [
    {
      label:  'Temperature (°C)',
      values: runs.map(r => r.temperature),
    },
    {
      label:  `Charge Load (${chargeUnit})`,
      values: runs.map(r => r.chargeLoad),
    },
    {
      label:  `Discharge Load (${dischUnit})`,
      values: runs.map(r => r.dischargeLoad),
    },
    {
      label:          'Disch. Term. Value',
      values:         runs.map(r => r.termCombo.dischargeValue),
      // Show the discharge unit in a note via the axis label suffix where values differ
    },
    {
      label:          'Chg. Term. Value',
      values:         runs.map(r => r.termCombo.chargeValue),
    },
    {
      label:    'Term. Combo',
      values:   comboIndices,
      tickvals,
      ticktext,
    },
  ];

  const trace = {
    type:       'parcoords',
    line: {
      color:      runNums,
      colorscale: 'Viridis',
      showscale:  true,
      cmin:       1,
      cmax:       nRuns,
      colorbar: {
        title:      { text: 'Run', side: 'right' },
        thickness:  14,
        len:        0.8,
      },
    },
    dimensions,
  };

  const layout = {
    margin:        { t: 30, r: 80, b: 20, l: 60 },
    autosize:      true,
    paper_bgcolor: '#ffffff',
    font:          { size: 11 },
  };

  Plotly.react('plot-parcoords', [trace], layout, { responsive: true, displayModeBar: false });
}

// ── CSV download ───────────────────────────────────────────────────────────

function downloadCSV() {
  if (!state.results) return;
  const f = state.factors;
  const chargeUnit = f.chargeLoad.unit;
  const dischUnit  = f.dischargeLoad.unit;

  const header = [
    'Run',
    'Temperature_degC',
    `ChargeLoad_${chargeUnit}`,
    `DischargeLoad_${dischUnit}`,
    'DischargeTermType',
    'DischargeTermValue',
    'ChargeTermType',
    'ChargeTermValue',
  ].join(',');

  const rows = state.results.map(r => {
    const du = TERMINATION_UNITS[r.termCombo.dischargeType];
    const cu = TERMINATION_UNITS[r.termCombo.chargeType];
    return [
      r.run,
      r.temperature,
      r.chargeLoad,
      r.dischargeLoad,
      r.termCombo.dischargeType,
      `${r.termCombo.dischargeValue} ${du}`,
      r.termCombo.chargeType,
      `${r.termCombo.chargeValue} ${cu}`,
    ].join(',');
  });

  const csv  = [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `doe_${state.method}_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── DOM synchronisation ────────────────────────────────────────────────────

function syncStateFromDOM() {
  const parseAndStore = (inputId, factorKey) => {
    const raw = document.getElementById(inputId).value;
    const result = parseValueList(raw);
    state.factors[factorKey].values = result.values;
    document.getElementById(inputId).classList.toggle('invalid', result.invalid && raw.trim() !== '');
    return result.hadDuplicates;
  };

  const dupWarnings = [];
  if (parseAndStore('input-temperature',  'temperature'))   dupWarnings.push('Temperature');
  if (parseAndStore('input-charge',       'chargeLoad'))    dupWarnings.push('Charge Load');
  if (parseAndStore('input-discharge',    'dischargeLoad')) dupWarnings.push('Discharge Load');

  if (dupWarnings.length > 0) {
    const errContainer = document.getElementById('validation-errors');
    const notice = document.createElement('p');
    notice.style.cssText = 'font-size:0.8rem;color:var(--color-warning);margin:0 0 0.5rem';
    notice.textContent = `Duplicate values removed from: ${dupWarnings.join(', ')}.`;
    errContainer.prepend(notice);
  }

  syncCombosFromDOM();
}

// ── Initialisation ─────────────────────────────────────────────────────────

function init() {
  // Method radio buttons
  document.querySelectorAll('input[name="doe-method"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.method-extra').forEach(el => el.classList.add('hidden'));
      document.getElementById(`extra-${radio.value}`).classList.remove('hidden');
      state.method = radio.value;
    });
  });

  // LHS samples
  document.getElementById('input-lhs-samples').addEventListener('input', e => {
    state.methodParams.samples = parseInt(e.target.value, 10);
  });

  // Taguchi levels
  document.getElementById('select-taguchi-levels').addEventListener('change', e => {
    const L = parseInt(e.target.value, 10);
    state.methodParams.taguchiLevels = L;
    document.getElementById('taguchi-array-name').textContent = L === 2 ? 'L8' : 'L9';
  });

  // Charge unit
  document.getElementById('select-charge-unit').addEventListener('change', e => {
    state.factors.chargeLoad.unit = e.target.value;
  });

  // Discharge unit
  document.getElementById('select-discharge-unit').addEventListener('change', e => {
    state.factors.dischargeLoad.unit = e.target.value;
  });

  // Add combination button
  document.getElementById('btn-add-combo').addEventListener('click', () => addComboRow());

  // Generate button
  document.getElementById('btn-generate').addEventListener('click', validateAndGenerate);

  // Download CSV button
  document.getElementById('btn-download-csv').addEventListener('click', downloadCSV);

  // Live invalid-highlight on blur for numeric factor inputs
  ['input-temperature', 'input-charge', 'input-discharge'].forEach(id => {
    document.getElementById(id).addEventListener('blur', () => {
      const raw = document.getElementById(id).value;
      const result = parseValueList(raw);
      document.getElementById(id).classList.toggle('invalid', result.invalid && raw.trim() !== '');
    });
  });

  // Add one default combo row to start
  addComboRow();
}

document.addEventListener('DOMContentLoaded', init);
