# Voltt Tool UI Style Guide

Use this file as context when building standalone HTML tool pages for embedding in Voltt. Every tool page must visually match the Voltt platform. This guide gives you all the design tokens, patterns, and rules you need.

---

## Font

```css
font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

Load via Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Type Scale

| Token   | Size     | Use                          |
|---------|----------|------------------------------|
| `--text-sm`  | 0.8rem (12.8px)  | Labels, captions, hints      |
| `--text-base`| 0.9rem (14.4px)  | Body text, inputs, dropdowns |
| `--text-xl`  | 1.0rem (16px)    | Subheadings, card titles     |
| `--text-2xl` | 1.2rem (19.2px)  | Section headings             |
| `--text-3xl` | 1.3rem (20.8px)  | Page subtitles               |
| `--text-4xl` | 1.4rem (22.4px)  | Page titles                  |
| `--text-5xl` | 1.5rem (24px)    | Hero numbers, large stats    |
| `--text-6xl` | 2.4rem (38.4px)  | Feature numbers (rare)       |

### Font Weights

- **400** - Body text, labels
- **500** - Field labels, secondary headings
- **600** - Card titles, button text, emphasis
- **700** - Page headings, stat values

---

## Colour Palette

### Core Colours

```css
:root {
  /* Primary - Green (brand colour, used for CTAs, active states, success) */
  --color-green:       #33b257;
  --color-green-light: #7dda98;
  --color-green-dark:  #1e6632;
  --color-green-bg:    rgba(51, 178, 87, 0.15);  /* #33b25726 */

  /* Secondary - Blue (info, links, secondary actions) */
  --color-blue:        #58b8fe;
  --color-blue-light:  #b7dfff;
  --color-blue-dark:   #1a6eb5;
  --color-blue-bg:     rgba(88, 184, 254, 0.15);

  /* Neutral - Gray */
  --color-gray:        #323232;
  --color-gray-light:  #dadada;
  --color-gray-dark:   #000000;
  --color-gray-bg:     #f5f5f5;
  --color-gray-button: #e5e7eb;
  --color-gray-border: #e5e7eb;  /* default border */
  --color-gray-100:    #f3f4f6;
  --color-gray-200:    #e5e7eb;
  --color-gray-500:    #6b7280;
  --color-gray-600:    #4b5563;
  --color-gray-700:    #374151;
  --color-gray-900:    #111827;

  /* Status */
  --color-red:         #f0421c;
  --color-orange:      #ffa500;
  --color-yellow:      #ffc107;
  --color-purple:      #7d3c98;
}
```

### When to Use Each Colour

| Colour | Use For |
|--------|---------|
| Green `#33b257` | Primary buttons, active/selected states, success indicators, slider thumbs/tracks, focus rings, links on hover |
| Green dark `#1e6632` | Hover state for primary buttons, result values, emphasis text on green backgrounds |
| Green bg `rgba(51,178,87,0.15)` | Success badges, selected chips, light success backgrounds |
| Blue `#58b8fe` | Info badges, secondary highlights, chart accent colour |
| Gray `#323232` | Primary text colour |
| Gray `#6b7280` | Secondary/muted text |
| Gray `#e5e7eb` | Borders, dividers, button backgrounds |
| Gray `#f5f5f5` | Page background, hover states on white elements |
| Red `#f0421c` | Errors, danger actions, destructive badges |
| Orange `#ffa500` | Warnings, caution states |
| Yellow `#ffc107` | Highlight, attention markers |
| White `#ffffff` | Card backgrounds, input backgrounds |

---

## Layout

### Page Background

```css
body {
  background: #f5f5f5;  /* --color-gray-bg */
  color: #323232;        /* --color-gray */
  padding: 20px;
}
```

### Page Header

```css
.page-header h1 {
  font-size: 1.4rem;   /* --text-4xl */
  font-weight: 700;
  color: #323232;
}
.page-header p {
  font-size: 0.8rem;   /* --text-sm */
  color: #6b7280;
  margin-top: 4px;
}
```

### Grid System

Use CSS Grid for page layouts. Common patterns:

```css
/* Sidebar + main content */
.main-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  max-width: 1260px;
  margin: 0 auto;
}

/* Result cards strip */
.results-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

/* Property chips (2-column) */
.prop-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
```

---

## Cards (Primary Container)

Cards are the main content container. Every grouped section goes in a card.

```css
.card {
  background: #ffffff;
  border-radius: 16px;       /* rounded-2xl */
  border: 1px solid #e5e7eb; /* gray-200 border */
  padding: 18px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);  /* shadow-sm */
}
```

### Card Header

```css
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.card-title {
  font-size: 0.9rem;  /* --text-base */
  font-weight: 600;
  color: #323232;
}
```

---

## Buttons

### Primary (Green CTA)

```css
.btn-primary {
  background: #33b257;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.9rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 150ms ease-in-out;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.btn-primary:hover { background: #1e6632; }
.btn-primary:focus { outline: none; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #33b257; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
```

### Secondary

```css
.btn-secondary {
  background: #e5e7eb;
  color: #323232;
  /* same border-radius, padding, font as primary */
}
.btn-secondary:hover { background: #dadada; }
```

### Outline

```css
.btn-outline {
  background: #ffffff;
  color: #323232;
  border: 1px solid #dadada;
}
.btn-outline:hover { background: #f5f5f5; }
```

### Ghost (Text-only)

```css
.btn-ghost {
  background: transparent;
  color: #323232;
  border: none;
}
.btn-ghost:hover { background: #f5f5f5; }
```

### Button Sizes

| Size  | Padding          | Font Size |
|-------|------------------|-----------|
| Small | 6px 12px         | 0.75rem (12px) |
| Medium| 8px 16px         | 0.8rem (12.8px) |
| Large | 10px 24px        | 0.9rem (14.4px) |

---

## Form Controls

### Inputs / Selects

```css
input, select {
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  background: #fafafa;
  color: #323232;
  transition: border-color 150ms ease-in-out;
}
input:focus, select:focus {
  outline: none;
  border-color: #33b257;
  box-shadow: 0 0 0 2px rgba(51, 178, 87, 0.15);
}
```

### Labels

```css
label {
  font-size: 0.8rem;    /* --text-sm */
  font-weight: 500;
  color: #6b7280;        /* gray-500 */
  margin-bottom: 4px;
}
```

### Range Sliders

```css
input[type="range"] {
  -webkit-appearance: none;
  height: 4px;
  border-radius: 2px;
  background: #e5e7eb;
  outline: none;
  cursor: pointer;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #33b257;       /* green */
  border: 2px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  cursor: pointer;
}
```

### Slider Value Display

```css
.slider-value {
  font-size: 0.8rem;
  font-weight: 600;
  color: #1e6632;          /* green-dark */
  background: rgba(51, 178, 87, 0.15);  /* green-bg */
  padding: 3px 7px;
  border-radius: 4px;
  min-width: 52px;
  text-align: right;
}
```

### Slider Range Labels

```css
.slider-range {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #dadada;
}
```

---

## Data Display

### Property Chips (Key-Value Pairs)

```css
.prop-chip {
  background: #f5f5f5;     /* gray-bg */
  border-radius: 8px;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
}
.prop-chip .label {
  font-size: 10px;
  color: #9ca3af;           /* gray-400 */
  margin-bottom: 2px;
}
.prop-chip .value {
  font-size: 0.9rem;
  font-weight: 600;
  color: #323232;
}
.prop-chip .unit {
  font-size: 10px;
  color: #dadada;
}
```

### Result Cards (Highlighted Metrics)

```css
.result-card {
  background: #ffffff;
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  border-top: 3px solid #33b257;  /* green accent */
}
.result-card .label {
  font-size: 0.8rem;
  color: #6b7280;
  margin-bottom: 4px;
}
.result-card .value {
  font-size: 1.5rem;   /* --text-5xl */
  font-weight: 700;
  color: #1e6632;       /* green-dark */
}
.result-card .unit {
  font-size: 0.8rem;
  color: #9ca3af;
  margin-top: 2px;
}
```

### Stat Cards (Variant Backgrounds)

| Variant | Background | Label Colour | Value Colour |
|---------|-----------|--------------|--------------|
| Default | `#f9fafb` (gray-50) | `#6b7280` | `#111827` |
| Success | `#f0fdf4` (green-50) | `#16a34a` | `#15803d` |
| Warning | `#fffbeb` (amber-50) | `#d97706` | `#b45309` |
| Danger  | `#fef2f2` (red-50) | `#dc2626` | `#b91c1c` |
| Info    | `#eff6ff` (blue-50) | `#2563eb` | `#1d4ed8` |

---

## Badges

### Solid Style

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
}
.badge-success  { background: rgba(51,178,87,0.15);  color: #1e6632; }
.badge-info     { background: rgba(88,184,254,0.15);  color: #1a6eb5; }
.badge-warning  { background: rgba(255,165,0,0.1);    color: #ffa500; }
.badge-danger   { background: rgba(240,66,28,0.1);    color: #f0421c; }
.badge-gray     { background: #e5e7eb;                color: #374151; }
```

### Outline Style

```css
.badge-outline         { background: transparent; border: 1px solid; }
.badge-outline.success { border-color: #7dda98; color: #33b257; }
.badge-outline.info    { border-color: #b7dfff; color: #58b8fe; }
.badge-outline.warning { border-color: #ffa500; color: #ffa500; }
.badge-outline.danger  { border-color: #f0421c; color: #f0421c; }
```

---

## Alerts / Warning Bars

```css
.alert {
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.8rem;
  line-height: 1.5;
  border-left: 4px solid;
}
.alert-info    { background: rgba(88,184,254,0.15); color: #1a6eb5; border-color: #58b8fe; }
.alert-success { background: rgba(51,178,87,0.15);  color: #1e6632; border-color: #33b257; }
.alert-warning { background: #fff3e0;               color: #e65100; border-color: #ffa500; }
.alert-error   { background: #fef2f2;               color: #b91c1c; border-color: #f0421c; }
```

---

## Info Boxes (Expandable Help Text)

```css
.info-box {
  background: #f6faf6;
  border-left: 3px solid #33b257;
  border-radius: 0 4px 4px 0;
  padding: 9px 11px;
  font-size: 0.8rem;
  color: #4b5563;
  line-height: 1.65;
  margin-bottom: 12px;
}
.info-box code {
  background: #e8f5e9;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.75rem;
  color: #2e7d32;
  font-family: monospace;
}
```

---

## Tabs

### Underline Style (Default)

```css
.tabs {
  display: flex;
  border-bottom: 1px solid #e5e7eb;
}
.tab {
  padding: 10px 16px;
  font-size: 0.9rem;
  color: #4b5563;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 150ms;
}
.tab:hover { border-bottom-color: #dadada; }
.tab.active { border-bottom-color: #33b257; color: #33b257; }
```

### Pills Style

```css
.tabs-pills {
  display: inline-flex;
  gap: 4px;
  background: #f3f4f6;
  padding: 4px;
  border-radius: 8px;
}
.tab-pill {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.9rem;
  color: #4b5563;
  cursor: pointer;
}
.tab-pill.active {
  background: #ffffff;
  color: #33b257;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
```

---

## Charts

### Chart Colour Palette (Series Order)

```
1. #33b257  (Green - primary)
2. #f0421c  (Red)
3. #58b8fe  (Blue)
4. #7d3c98  (Purple)
5. #ffc107  (Yellow)
6. #ffa500  (Orange)
```

### Heatmap / Surface Colour Scale

```
#313695 → #4575b4 → #74add1 → #abd9e9 → #e0f3f8 → #ffffbf → #fee090 → #fdae61 → #f46d43 → #d73027 → #a50026
```

### Chart Styling

```css
/* Grid lines */
stroke: #eeeeee;

/* Axis lines */
stroke: #cccccc;

/* Axis labels and text */
fill: #333333;
font-family: 'Montserrat', sans-serif;
font-size: 12px;

/* Tooltip */
background: rgba(255, 255, 255, 0.95);
border: 1px solid #e5e7eb;
color: #333333;
border-radius: 6px;
padding: 7px 10px;
font-size: 11px;
box-shadow: 0 2px 8px rgba(0,0,0,0.12);
```

### Chart Operating Point Dot

```css
/* Highlighted current value on chart */
fill: #ff7043;
stroke: #ffffff;
stroke-width: 1.5;
r: 5;
```

---

## Modals / Overlays

```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
}
.modal-panel {
  background: #ffffff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
  max-height: 90vh;
  overflow-y: auto;
}
```

---

## Transitions

All interactive elements use this default transition:

```css
transition: all 150ms ease-in-out;
```

---

## Focus States

All focusable elements must show a green focus ring:

```css
:focus {
  outline: none;
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #33b257;
}
```

---

## Disabled States

```css
[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
```

---

## Spacing Reference

Use multiples of 4px for all spacing (padding, margins, gaps):

| Token | Value |
|-------|-------|
| xs    | 4px   |
| sm    | 8px   |
| md    | 12px  |
| base  | 16px  |
| lg    | 20px  |
| xl    | 24px  |
| 2xl   | 32px  |

---

## Border Radius Reference

| Token | Value | Use |
|-------|-------|-----|
| sm    | 4px   | Small chips, code blocks |
| md    | 6px   | Badges, tags |
| lg    | 8px   | Buttons, inputs, dropdowns |
| xl    | 12px  | Cards, modals |
| 2xl   | 16px  | Main containers |
| full  | 9999px | Circular elements, pills |

---

## Complete CSS Variables Block

Copy this into the `<style>` of any tool page:

```css
:root {
  --green: #33b257;
  --green-light: #7dda98;
  --green-dark: #1e6632;
  --green-bg: rgba(51, 178, 87, 0.15);

  --blue: #58b8fe;
  --blue-light: #b7dfff;
  --blue-dark: #1a6eb5;
  --blue-bg: rgba(88, 184, 254, 0.15);

  --gray: #323232;
  --gray-light: #dadada;
  --gray-bg: #f5f5f5;
  --gray-border: #e5e7eb;
  --gray-button: #e5e7eb;
  --gray-muted: #6b7280;
  --gray-subtle: #9ca3af;

  --red: #f0421c;
  --orange: #ffa500;
  --yellow: #ffc107;
  --purple: #7d3c98;

  --font: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 1px 4px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 4px 12px rgba(0, 0, 0, 0.1);
  --transition: 150ms ease-in-out;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--font); background: var(--gray-bg); color: var(--gray); }
```

---

## Checklist

Before submitting a tool page, verify:

- [ ] Uses Montserrat font (loaded from Google Fonts)
- [ ] Page background is `#f5f5f5`
- [ ] Cards have white background, `border-radius: 16px`, `border: 1px solid #e5e7eb`, and `box-shadow`
- [ ] Primary actions use green `#33b257` with dark hover `#1e6632`
- [ ] All inputs/selects show green focus ring
- [ ] Slider thumbs are green with white border
- [ ] Text hierarchy: gray `#323232` for primary, `#6b7280` for secondary, `#9ca3af` for hints
- [ ] Chart series follow the colour order: green, red, blue, purple, yellow, orange
- [ ] Spacing uses 4px multiples
- [ ] No font-size smaller than 10px
- [ ] All interactive elements have `cursor: pointer` and the standard transition
