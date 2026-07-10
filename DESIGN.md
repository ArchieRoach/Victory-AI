# Victory AI — Design System

> Read this file before writing any frontend code. Every UI decision must follow these rules.
> When in doubt: dark, sharp, lime-accented. Never white backgrounds, never generic blue buttons, never emoji as icons.

---

## 1. Color Palette

All colors are defined as Tailwind custom tokens. Always use the token name — never hardcode hex values.

| Token | Hex | Usage |
|---|---|---|
| `victory-bg` | `#0A0A0F` | Page background — always |
| `victory-card` | `#12121A` | Card surfaces, list items |
| `victory-card-highlight` | `#1A1A26` | Elevated cards, inputs, secondary surfaces |
| `victory-border` | `#2A2A3A` | All borders and dividers |
| `victory-lime` | `#E8FF47` | Primary accent — CTAs, active states, highlights |
| `victory-teal` | `#47E8C8` | Secondary accent — gradients, badges, streaks |
| `victory-orange` | `#FF6B35` | Energy, warnings, fight metrics |
| `victory-danger` | `#FF4757` | Destructive actions, errors, losses |
| `victory-text` | `#F0F0F5` | Primary body text |
| `victory-muted` | `#8888A0` | Secondary text, placeholders, inactive icons |

### Color rules

- **Backgrounds**: Always `bg-victory-bg`. Never white, never gray-900.
- **Lime** is the primary action color — one dominant lime element per screen, not scattered everywhere.
- **Opacity variants**: Use Tailwind opacity modifiers (`victory-lime/10`, `victory-lime/20`) for subtle tints. Common: `/5` hover bg, `/10` icon box bg, `/15` active nav pill, `/20` tints, `/30` glow shadows.
- **Text hierarchy**: `text-victory-text` → `text-victory-muted` → nothing else.
- **Never**: generic Tailwind colors (`blue-500`, `gray-700`, `white`) on Victory AI surfaces.

---

## 2. Typography

```js
// tailwind.config.js
fontFamily: {
  heading: ["Space Grotesk", "sans-serif"],  // font-heading
  body:    ["Inter", "sans-serif"],           // font-body (default)
  mono:    ["JetBrains Mono", "monospace"],   // font-mono
}
```

### Rules

| Use case | Class |
|---|---|
| Page titles, section headers | `font-heading font-extrabold tracking-tight` |
| Buttons, tab labels, filter pills | `font-heading font-bold` or `font-heading font-semibold` |
| Body text, descriptions | `font-body` (default — no class needed) |
| Scores, stats, numeric data, timers | `font-mono font-bold` |
| Small labels above sections | `.section-label` (lime, 10px, uppercase, tracked) |

- All `h1`–`h6` automatically get `font-heading font-extrabold tracking-tight` via base styles.
- Never use `font-sans` — it bypasses the Inter stack.
- The `.timer-display` class handles the session timer: `Space Grotesk 800 clamp(6rem,20vw,12rem)`.

---

## 3. Spacing & Layout

- **Max content width**: `max-w-lg mx-auto` — Victory AI is a mobile-first app.
- **Page padding**: `px-4` horizontal, `p-4` for headers.
- **Content below nav**: `pb-nav` (100px) or `pb-24` on page wrappers.
- **Bottom nav height**: 80px (`h-20`), fixed.
- **Section gaps**: `space-y-3` between cards, `space-y-4` between major sections.
- **Card padding**: `p-4` standard, `p-3` compact.

### Border radius

| Size | Class | Usage |
|---|---|---|
| Large | `rounded-2xl` | Icon boxes, avatar containers, large cards |
| Standard | `rounded-xl` | Buttons, inputs, modals |
| Base | `rounded-lg` | Cards (via `.victory-card`), list items |
| Full | `rounded-full` | Pills, badges, avatars, dots |

---

## 4. Component Library

### Buttons

Always use one of these three — never write a bare `<button className="bg-blue-500 ...">`.

```jsx
// Primary — main CTA, one per screen
<button className="victory-btn-primary">Start Session</button>
// min-h-[52px], full width, lime bg, dark text, font-heading font-bold

// Secondary — alternative action
<button className="victory-btn-secondary">View Details</button>
// transparent, lime border and text

// Ghost — tertiary / destructive / nav actions
<button className="victory-btn-ghost">Cancel</button>
// card-highlight bg, standard text
```

**Button rules:**
- Primary buttons are full-width (`w-full`) by default — use `w-auto` only for inline actions.
- All buttons have `active:scale-[0.98]` baked in — never add extra press effects.
- Minimum touch target for any interactive element: **44px** (`w-11 h-11` / `touch-target` class).
- Icon-only buttons: `w-11 h-11 rounded-full flex items-center justify-center` + `aria-label`.

### Cards

```jsx
// Standard card
<div className="victory-card p-4">…</div>
// bg-victory-card border border-victory-border rounded-lg

// Elevated / highlighted card
<div className="victory-card-highlight p-4">…</div>

// Clickable card — add press effect
<div className="victory-card p-4 cursor-pointer active:scale-[0.99] transition-transform">…</div>

// Lime-accented card (e.g. current user's rank)
<div className="victory-card p-4 border border-victory-lime/30 bg-victory-lime/5">…</div>
```

### Inputs

```jsx
<label className="victory-label">Email</label>
<input className="victory-input" placeholder="you@example.com" />
// bg-victory-card, 48px min-height, lime focus ring
```

### Stat pills

```jsx
<div className="stat-pill">
  <span className="font-mono font-bold text-xl text-victory-lime">87</span>
  <span className="text-victory-muted text-xs mt-1">Avg Score</span>
</div>
// bg-victory-card-highlight border border-victory-border rounded-lg px-4 py-3
```

### Section labels

```jsx
<p className="section-label mb-3">This Week</p>
// text-victory-lime text-[10px] font-bold uppercase tracking-[0.18em]
```

### Filter pills

```jsx
// Active
<button className="filter-pill filter-pill-active">Heavyweight</button>
// bg-victory-lime text-victory-bg

// Inactive
<button className="filter-pill filter-pill-inactive">Middleweight</button>
// bg-victory-card border text-victory-muted
```

### Gradient text

```jsx
<span className="text-gradient">Victory</span>
// lime → teal, bg-clip-text
```

---

## 5. Patterns

### Empty states

Every empty list, zero results, or first-run state must use this pattern:

```jsx
<div className="flex flex-col items-center justify-center py-16 text-center px-6">
  <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
    <IconName className="w-8 h-8 text-victory-lime/60" />
  </div>
  <p className="text-victory-text font-bold text-lg mb-1">Nothing here yet</p>
  <p className="text-victory-muted text-sm">Helpful one-line explanation</p>
  {/* Optional CTA */}
  <button className="mt-4 victory-btn-primary w-auto px-6">Get started</button>
</div>
```

**Never**: bare emoji, bare muted text with no icon, generic gray placeholder.

### Loading skeletons

```jsx
// Shimmer skeleton line
<div className="skeleton-shimmer h-4 rounded w-2/3" />

// Shimmer card
<div className="skeleton-shimmer h-16 rounded-lg" />

// Animated pulse alternative (Tailwind)
<div className="bg-victory-card border border-victory-border rounded-2xl p-4 animate-pulse">
  <div className="w-14 h-14 rounded-full bg-victory-border" />
</div>
```

### Page header

```jsx
<header className="p-4 border-b border-victory-border">
  <h1 className="text-xl font-heading font-extrabold text-victory-text">
    Page Title
  </h1>
  <p className="text-victory-muted text-sm">Subtitle or count</p>
</header>
```

### Sticky header

```jsx
<div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border">
  {/* header content */}
</div>
```

### Error / toast notifications

Always use Sonner — never inline error `<p>` or `alert()`.

```jsx
import { toast } from "sonner";

toast.error("Could not save — check your connection");
toast.success("Session saved!");
```

### Score / numeric display

```jsx
<p className="font-mono font-bold text-3xl text-victory-lime">87.4</p>
// Scores are always lime + mono
// Losses / negative values: text-red-400
// Neutral stats: text-victory-text or text-victory-muted
```

### Live badge

```jsx
<span className="flex items-center gap-0.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
  <Radio className="w-2 h-2" /> LIVE
</span>
```

### Bottom nav active state

```jsx
// Active: text-victory-lime + bg-victory-lime/15 pill + lime dot at top
// Inactive: text-victory-muted hover:text-victory-text
// Icon: w-5 h-5, strokeWidth 2.5 active / 2 inactive
// Label: text-[10px] font-bold active / font-medium inactive
```

---

## 6. Accessibility & Touch

- **Minimum touch target**: 44px × 44px on all interactive elements. Use `w-11 h-11` or the `.touch-target` class.
- **Every icon-only button** must have `aria-label`.
- **Focus styles**: `outline: 2px solid #E8FF47; outline-offset: 2px` — applied globally via `button:focus-visible`.
- **Tap highlight**: Disabled globally (`-webkit-tap-highlight-color: transparent`).
- **Text selection**: Disabled on interactive elements via `.no-select`.

---

## 7. Animation

Use the project's defined keyframes — never write custom keyframe CSS for common patterns.

| Class | Effect | Duration |
|---|---|---|
| `animate-fade-in` | opacity 0→1 | 0.3s |
| `animate-slide-up` | translateY 10px→0 + fade | 0.3s |
| `animate-slide-down` | slide down with spring | 0.35s cubic-bezier |
| `animate-scale-in` | scale 0.85→1 + fade | 0.4s cubic-bezier |
| `animate-pulse-glow` | lime glow pulse | 2s loop |
| `animate-bounce-slow` | gentle float | 1.4s loop |
| `active:scale-[0.98]` | press depression | instant |
| `transition-colors duration-200` | color transitions | 200ms |

- **Never** add `transition-all` — only transition specific properties.
- Spring animations use `cubic-bezier(0.34,1.56,0.64,1)` for feel.

### Flash effects (post-action feedback)

```jsx
// After a successful action on a workout component:
element.classList.add("flash-lime"); // fades from lime/30 → transparent
// For teal variant: flash-teal
```

---

## 8. Page Structure Template

Every page follows this shell:

```jsx
export default function ExamplePage() {
  return (
    <div className="min-h-screen bg-victory-bg pb-nav">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border">
        <header className="p-4">
          <h1 className="text-xl font-heading font-extrabold text-victory-text">Title</h1>
          <p className="text-victory-muted text-sm">Subtitle</p>
        </header>
      </div>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {/* Loading state */}
        {loading && <div className="skeleton-shimmer h-16 rounded-lg" />}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
              <Icon className="w-8 h-8 text-victory-lime/60" />
            </div>
            <p className="text-victory-text font-bold text-lg mb-1">Nothing here yet</p>
            <p className="text-victory-muted text-sm">Description</p>
          </div>
        )}

        {/* Content */}
        {!loading && items.map(item => (
          <div key={item.id} className="victory-card p-4">…</div>
        ))}
      </main>

      <BottomNav />
    </div>
  );
}
```

---

## 9. What NOT to Do

| ❌ Wrong | ✅ Right |
|---|---|
| `bg-white`, `bg-gray-900` | `bg-victory-bg` |
| `text-white` | `text-victory-text` |
| `border-gray-700` | `border-victory-border` |
| `bg-blue-500` button | `.victory-btn-primary` |
| `className="bg-green-400 text-black"` CTA | `.victory-btn-primary` |
| `font-sans` | `font-body` (or nothing — Inter is default) |
| Emoji as icon (`🥊`) in UI | Lucide icon in icon box |
| Bare `<p className="text-gray-400">No data</p>` empty state | Full icon + heading + muted text pattern |
| `console.error(err)` in catch | `toast.error("User-facing message")` |
| `w-8 h-8` interactive element | `w-11 h-11` (44px minimum) |
| Icon-only button with no label | `aria-label="Action name"` required |
| Hardcoded `#E8FF47` | `text-victory-lime` / `bg-victory-lime` |
| Generic Tailwind `text-sm text-gray-500` subtitle | `text-victory-muted text-sm` |

---

## 10. Icon Usage

- **Library**: Lucide React (`from "lucide-react"`)
- **Standard icon size**: `w-5 h-5` in nav/headers, `w-4 h-4` inline, `w-8 h-8` in empty state icon boxes
- **Icon color**: matches text context — `text-victory-lime`, `text-victory-muted`, `text-victory-text`
- **Never** use emoji as functional icons in UI components
- **Stroke width**: `strokeWidth={2}` default, `strokeWidth={2.5}` for active/prominent states

---

## 11. Scrolling

```jsx
// Hide scrollbar on scroll containers
<div className="overflow-x-auto no-scrollbar">…</div>

// Horizontal filter rows
<div className="flex gap-2 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
  {pills}
</div>
```
