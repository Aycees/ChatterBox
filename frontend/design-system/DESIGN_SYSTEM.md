# ChatterBox Design System

**Status:** ready for implementation
**Scope:** `frontend/` (Next.js 16 / React 19 / Tailwind CSS v4 / TanStack Query)
**Companion file:** [`tokens.css`](./tokens.css) — the tokens below as a drop-in extension of `app/globals.css`

## How to use this document

This is a handoff spec, written for whoever implements it next (Claude Code or a human) as much as for the person reading it now. It was built by reading the actual current codebase — `ChatterBox_Project_Spec.md`, `app/globals.css`, and every page/component under `app/` and `lib/` — not written in the abstract, so component specs reference real files and real class names that exist today.

It does three things:

1. **Tokens** — the atomic values (color, type, spacing, radius, shadow, motion) that everything else is built from.
2. **Components & patterns** — how those tokens compose into the pieces ChatterBox actually needs: buttons, message bubbles, the room list, the chat shell.
3. **Implementation Handoff** — a phased, file-by-file checklist for applying this system to the existing app without a rewrite.

Nothing here touches `backend/` or the RLS/auth model — this is purely the visual and interaction layer for `frontend/`.

---

## 1. Brand direction

ChatterBox is a real-time chat system built on a genuinely interesting security model (Postgres RLS enforcing who can see what, independent of the app layer). The UI should read the same way: **clear, fast, quietly confident** — closer to Linear or Vercel's dashboard aesthetic than to a playful consumer chat app. No mascots, no bubble gradients, no illustration budget. One deliberate accent color doing all the personality work against a clean neutral canvas, in both themes.

The app already has the right instinct (flat, bordered, zinc-neutral, `prefers-color-scheme` dark mode) — it just stops short of an actual system: no brand color, no component reuse, no focus states, and a couple of real UX gaps (below). This system keeps everything that already works and fills in the rest.

---

## 2. Design tokens

Full implementation is in [`tokens.css`](./tokens.css). This section is the reference table.

### 2.1 Color

**Brand scale** — new. Hue 264 (blue-violet), defined in OKLCH so every step is perceptually even:

| Token | Value | Typical use |
|---|---|---|
| `brand-50` … `brand-200` | very light tints | subtle backgrounds (e.g. `accent-subtle`) |
| `brand-500` | `oklch(0.62 0.17 264)` | dark-mode primary accent |
| `brand-600` | `oklch(0.53 0.19 264)` | **light-mode primary accent** — primary buttons, links, focus ring source |
| `brand-700` | `oklch(0.45 0.18 264)` | hover state of primary actions |
| `brand-800` | `oklch(0.37 0.15 264)` | active/pressed state |
| `brand-900` / `brand-950` | dark tints | reserved, not currently needed |

**Semantic aliases** — new. These are the tokens components should actually be built against, never raw `zinc-*`/`brand-*` values:

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | white | `#0a0a0a` | page background (unchanged from today) |
| `foreground` | `zinc-900` | `zinc-50` | primary text (unchanged from today) |
| `surface` | white | `zinc-950` | card/panel background |
| `surface-raised` | `zinc-50` | `zinc-900` | hover rows, subtle panel-on-panel |
| `surface-sunken` | `zinc-100` | `#050505` | input backgrounds, code/quote blocks |
| `border` | `zinc-200` | white/10% | default hairline border |
| `border-strong` | `zinc-300` | white/16% | emphasized border (focus-adjacent, dividers) |
| `text-secondary` | `zinc-600` | `zinc-400` | de-emphasized text (labels, metadata) |
| `text-muted` | `zinc-500` | `zinc-500` | placeholder-level text |
| `accent` / `accent-hover` / `accent-active` | `brand-600/700/800` | `brand-500/400/300` | primary actions, links, selected states |
| `accent-subtle` | `brand-50` | brand @ 14% | selected row / active nav item background |
| `success`, `warning`, `danger`, `info` | Tailwind `emerald/amber/red/blue-600` | same hue, `-500` | status color, mapped to Tailwind's built-in scales rather than reinvented |
| `focus-ring` | `brand-500` | `brand-400` | see §5 Accessibility |

Why alias instead of using `zinc-600` directly in components: today `zinc-600`, `zinc-500`, `black/10`, `white/10` etc. are hand-typed in five different files. If the neutral scale ever needs to shift, that's five files to hunt through. One rename in `tokens.css` should be enough.

### 2.2 Typography

Font is Geist (already loaded via `next/font` in `app/layout.tsx`) — **currently unused**: `globals.css` hardcodes `font-family: Arial, Helvetica, sans-serif` on `body` despite defining `--font-sans`. `tokens.css` fixes this. Keep Geist; it's a good fit (technical, legible, already paid for in bundle size).

Restrict all UI text to this scale (Tailwind's default sizes — no arbitrary `text-[13px]` anywhere):

| Class | Size / line-height | Use |
|---|---|---|
| `text-xs` | 12 / 16 | timestamps, badges, helper text |
| `text-sm` | 14 / 20 | **default UI text** — labels, buttons, body copy, messages |
| `text-base` | 16 / 24 | rarely — only where `text-sm` reads too small (long-form empty states) |
| `text-lg` | 18 / 28 | page/section headings (`h1`/`h2` in a page context) |
| `text-xl` | 20 / 28 | room name in the chat header |
| `text-2xl` | 24 / 32 | reserved (not currently needed — the app has no marketing/landing surface) |

Weights: `font-normal` (body), `font-medium` (labels, secondary emphasis, nav items), `font-semibold` (headings, primary buttons) — this is already the pattern in use today, keep it as-is.

### 2.3 Spacing & layout

No new spacing tokens — Tailwind's default 4px scale is sufficient and already used correctly throughout. Two layout widths worth naming explicitly since they recur:

- **Auth width** — `max-w-sm` (384px), used by `/login` and `/register`. Keep.
- **Content width** — currently `max-w-2xl` (672px) on both the room list and an individual room. §4.2 recommends restructuring the room view into a sidebar + main layout, at which point this becomes the *sidebar* width budget (`w-72`, 288px) and the message pane goes fluid up to `max-w-3xl` for readable line length.

### 2.4 Radius

Use Tailwind's default scale, applied consistently by role (today it's a mix of bare `rounded` and `rounded-lg` with no logic to the split):

| Role | Class | px |
|---|---|---|
| Controls — buttons, inputs, checkboxes, badges | `rounded-lg` | 8 |
| Containers — cards, panels, message bubbles, modals | `rounded-xl` | 12 |
| Fully round — avatars, presence dots, pill badges | `rounded-full` | — |

### 2.5 Shadow

The app is currently flat (borders only, zero shadows) — keep that as the default; it suits the dense, technical aesthetic. Reserve elevation for things that visually float above the page:

| Class | Use |
|---|---|
| none (border only) | cards, panels, message bubbles, the default state of everything |
| `shadow-sm` | dropdown menus, the typing-indicator popover if one is added |
| `shadow-md` | anything modal (confirm dialogs, if added later) |

### 2.6 Motion

New — the app currently has zero transitions, including on things that clearly need one (button hover, connection-status changes). Use Tailwind's built-in duration/easing utilities, not custom tokens:

| Token | Use |
|---|---|
| `transition-colors duration-150` | button/link hover and active states |
| `duration-200 ease-out` | message bubble enter, toast/alert enter |
| CSS `animation`, ~1.2s loop | typing-indicator dots, presence-dot pulse |

Respect `prefers-reduced-motion: reduce` — disable the bubble-enter transition and slow the typing/presence animations to a single static state under that query.

---

## 3. Components

Each spec below is scoped to what ChatterBox actually needs — not a generic component-library kitchen sink. Components marked **(new)** don't exist in the codebase yet; components marked **(extract)** exist today as copy-pasted inline JSX across 2+ files and should become a shared component.

### 3.1 Button **(extract)**

Currently: every button in the app (`login/page.tsx`, `register/page.tsx`, `(protected)/page.tsx`, `rooms/[roomId]/page.tsx`) hand-writes `rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50`, or a bordered variant. Every primary action is literally colored `foreground`/`background` — black-on-white in light mode, white-on-black in dark mode. That's why the app currently reads as colorless: there is no accent anywhere.

**Variants**

| Variant | Background | Text | Use |
|---|---|---|---|
| `primary` | `accent` (hover `accent-hover`, active `accent-active`) | `text-on-brand` | Log in, Create account, Send, Create room |
| `secondary` | transparent, `border-border` | `foreground` | Log out, Load older messages, cancel actions |
| `ghost` | transparent, no border | `text-secondary` (hover `foreground`) | low-emphasis inline actions |
| `danger` | `danger` | white | destructive actions (none exist yet, reserved for e.g. leave-room if added) |

**Sizes:** `sm` (`px-3 py-1.5 text-xs`, used for "Join", "Load older messages") · `md` (`px-4 py-2 text-sm`, the default — matches current sizing).

**States:** default → `hover:bg-accent-hover` → `active:bg-accent-active` → `disabled:opacity-50 disabled:pointer-events-none` (matches existing disabled pattern) → loading (see below).

**Loading:** the app already has the right instinct — swapping label text for "Logging in...", "Creating...", etc. Keep that; it's simpler than a spinner and reads fine at this size. Just also apply `disabled` during the pending state everywhere (currently done for auth/room forms, correctly).

**Accessibility:** real `<button>` elements (already the case everywhere) · `disabled` attribute, not just a visual style, while a mutation is pending (already the case) · visible `:focus-visible` ring (new — see §5).

```tsx
// Suggested shape once extracted — frontend/components/button.tsx
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};
```

### 3.2 Field — label + input/textarea + error **(extract)**

The exact same 6-line block (`<label>` + `<input>` + conditional error `<p>`) is repeated 7 times across `login/page.tsx` and `register/page.tsx` with only the field name changed. Extracting this is the single highest-leverage refactor for these two files — it also makes it trivial to add the focus ring and error styling in one place instead of seven.

**Variants:** `text` / `email` / `password` (all `<input>`) and a `textarea` variant, needed once the composer (§4.3) grows beyond a single-line input.

**States:**

| State | Style |
|---|---|
| Default | `border-border`, `bg-surface-sunken` (a filled input reads more clearly than the current transparent-background one, especially in dark mode where a borderless-and-backgroundless field is easy to lose) |
| Focus | `border-accent` + the global focus ring |
| Error | `border-danger`, helper text switches to the error message in `text-danger` |
| Disabled | `opacity-50 cursor-not-allowed` |

**Accessibility:** `<label htmlFor>` paired to the input's `id` (already correct everywhere — keep it) · error text gets `id="{field}-error"` and the input gets `aria-describedby` pointing at it, plus `aria-invalid="true"` while an error is shown (all new — currently the error `<p>` has no programmatic link to its input, so a screen reader user gets the visual red text but no announcement).

```tsx
// frontend/components/field.tsx
type FieldProps = {
  label: string;
  id: string;
  error?: string;
  type?: "text" | "email" | "password" | "textarea";
} & (React.InputHTMLAttributes<HTMLInputElement> | React.TextareaHTMLAttributes<HTMLTextAreaElement>);
```

### 3.3 Card / Panel **(extract)**

The auth form container (`rounded-lg border ... bg-white p-8 dark:bg-zinc-950`) and the room-list sections are two ad hoc variants of the same idea. Formalize as one `Card` with padding as the only real variable: `p-8` for the centered auth card, `p-4`/`p-6` for in-flow panels.

`bg-surface border border-border rounded-xl`, padding per context above.

### 3.4 Badge **(new)**

Currently "Private" is plain `text-xs text-zinc-500` text next to a room name — invisible as a status indicator, easy to miss when scanning a list.

`inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium`, variants:

| Variant | Style | Use |
|---|---|---|
| `neutral` | `bg-surface-sunken text-text-secondary` | "Private" room tag |
| `accent` | `bg-accent-subtle text-accent` | "Owner" / role tag, if surfaced later |
| `success` | `bg-success-subtle text-success` | reserved |

### 3.5 Avatar **(new — real gap)**

There is currently **no avatar anywhere in the app**, and that's not just cosmetic — see §3.6, it's the reason group chat messages from other people are unattributed. Circular, initials-based (no image upload in the spec, so don't build for one):

- Background: a deterministic color picked from the `brand` hue rotated by a hash of the user id (or simplest: always `bg-accent-subtle text-accent` — flat and consistent, recommended over per-user hue rotation for a v1, since the latter needs a stable hash function and buys little).
- Sizes: `sm` (24px, inline in message rows), `md` (32px, header user indicator).
- Content: first letter of `username`, uppercased.
- `aria-hidden="true"` — the username is rendered as visible text next to it, so the avatar itself is decorative.

### 3.6 Message bubble **(extend existing)**

Current implementation (`rooms/[roomId]/page.tsx`) only distinguishes `isMine` vs. not — a message from anyone who isn't you renders identically regardless of who sent it. **In a multi-member room this is a real usability bug, not a style gap**: if three people are in a room, an incoming message tells you "not me" and nothing else.

Fix: for `!isMine` messages, render a small `Avatar` (sm) + username above or beside the bubble, once per contiguous run of messages from the same sender (don't repeat it on every single message in a burst — group consecutive messages from the same sender the way Slack/Discord do). For `isMine`, no avatar/name needed — alignment already communicates that.

| Part | Style |
|---|---|
| Bubble (mine) | `bg-accent text-text-on-brand rounded-xl px-3 py-2` |
| Bubble (theirs) | `bg-surface-raised text-foreground rounded-xl px-3 py-2` |
| Sender name (theirs, group runs) | `text-xs font-medium text-text-secondary`, above the bubble |
| Timestamp | `text-xs text-text-muted` — currently not rendered at all; add it, shown on hover for `isMine` (`group-hover:opacity-100`) and always visible for `theirs` since it sits next to the name anyway |

Requires `Message` to expose sender username, not just `sender_id` (`lib/types.ts` — check whether `MessageOut` on the backend already joins this; if not, that's a backend change, flag it rather than faking it client-side from stale room-member data).

### 3.7 Presence dot **(new)**

8px filled circle, `rounded-full`, `bg-success` for online. Place at the bottom-right of an `Avatar` (small offset, `-bottom-0.5 -right-0.5`, 2px `border-background` ring so it separates from the avatar fill) wherever a specific user's online state is shown. Distinct from the room-level "N online" counter already in the header — that one stays text, this is per-user.

### 3.8 Connection status pill **(extend existing)**

Today: plain text in the room header — "Connecting...", "Disconnected" — with no color coding, easy to miss. Convert to a small pill using the same shape as Badge:

| `connectionState` | Style | Label |
|---|---|---|
| `open` | `bg-success-subtle text-success` + a 6px pulse dot | "{n} online" (unchanged copy) |
| `connecting` | `bg-warning-subtle text-warning` + spin/pulse | "Connecting…" |
| `closed` | `bg-danger-subtle text-danger` | "Disconnected" |

Add `role="status" aria-live="polite"` on this element — right now a screen reader user is never told the connection dropped or recovered.

### 3.9 Typing indicator **(extend existing)**

Replace the plain "X people are typing..." text with the same text plus three animated dots (classic bounce: `animation-delay` staggered 0/150/300ms on three `span`s, `animation: bounce 1.2s infinite`). Keep the text — it's what makes this accessible; the dots are decorative (`aria-hidden`). Wrap the whole region in `aria-live="polite"` so a screen reader user is told someone started typing, same as the sighted UI already conveys.

### 3.10 Alert / inline message **(extract)**

Every error today is a bare `<p className="text-sm text-red-600 dark:text-red-400">`. Formalize into one component so error, and eventually success/info, states look consistent everywhere they appear (form errors, WS `lastError`, connection errors):

`flex items-start gap-2 rounded-lg px-3 py-2 text-sm`, variant backgrounds `{variant}-subtle` / text `{variant}` from §2.1. Include a leading icon slot (a simple inline SVG — circle-exclamation for danger, circle-check for success) since color alone shouldn't be the only signal (WCAG 1.4.1).

### 3.11 Checkbox **(new)**

The "Private" checkbox on room creation is currently a bare native `<input type="checkbox">` with zero styling. Style it to match the system rather than leaving one raw browser-default control in an otherwise-designed form: `h-4 w-4 rounded border-border-strong text-accent focus-visible:ring-2 focus-visible:ring-focus-ring` (Tailwind's `accent-color`-based approach — `accent-accent` — is the simplest correct fix and needs no custom SVG).

### 3.12 Empty state **(extend existing)**

"You're not in any rooms yet..." is currently a single line of body text. Give it the shape of an actual empty state so it doesn't read as a loading glitch: centered, `text-secondary` icon or initials mark, `text-sm font-medium text-foreground` heading ("No rooms yet"), `text-sm text-text-secondary` body (existing copy is fine), and — since the create-room form is already right below it on this page — no extra CTA needed there. Reuse the same shape for "select a room" in the app-shell rework (§4.2).

### 3.13 Loading state

Replace bare "Loading..." text with a lightweight skeleton for the two list views (room list rows, message bubbles): 2–3 `animate-pulse` `bg-surface-raised` blocks shaped like the real content. This is a perceived-performance win more than an aesthetic one — skip it if time-boxed, it's the lowest-priority item in this doc (see Phase 5).

---

## 4. Patterns

### 4.1 Auth screen (login / register) — keep as-is, structurally

Centered `Card` (`max-w-sm`), `Field` × 2–3, primary `Button`, secondary text link. This already works well and is already consistent between the two pages. Apply: `Field`/`Button`/`Card` extraction (§3.1–3.3), and swap the primary button from `bg-foreground` to `bg-accent` so the app has visible brand color on its very first screen.

### 4.2 App shell — the one structural change worth making

**Current structure:** `/` (room list) and `/rooms/[roomId]` (chat) are two unrelated full-page routes. Opening a room replaces the room list entirely; there's no way to see "what room am I in" relative to "what other rooms exist" without navigating back. For a chat app, this is the biggest UX gap in the current build — bigger than any individual component's styling.

**Recommended structure**, inside the existing `(protected)/layout.tsx` route group (no URL changes needed — `/` and `/rooms/[roomId]` stay the same paths):

```
┌─────────────────────────────────────────────┐
│ header: logo · [room name when in a room] · user menu │
├───────────────┬─────────────────────────────┤
│  Sidebar       │  Main pane                  │
│  (w-72,        │  - /            → Empty     │
│  persistent)   │    state: "Select a room,   │
│                │    or create one"           │
│  - Your rooms  │  - /rooms/[id]  → the chat  │
│    (list,      │    view (§4.3), unchanged   │
│    active      │    internally               │
│    room        │                             │
│    highlighted │                             │
│    accent-subtle) │                          │
│  - + New room  │                             │
│    (opens the  │                             │
│    existing    │                             │
│    create form,│                             │
│    inline or   │                             │
│    as a small  │                             │
│    popover)    │                             │
│  - Public rooms│                             │
│    (collapsible│                             │
│    section)    │                             │
└───────────────┴─────────────────────────────┘
```

- Below `md` (768px): sidebar and main pane don't share the viewport. Sidebar is the default view at `/`; opening a room shows the chat view full-width with a back affordance (a `ghost` `Button` with a left-chevron, top-left of the chat header) that returns to the sidebar. This is a visibility toggle, not a route change.
- The room-list *data* (`useMyRooms`, `usePublicRooms`, `useCreateRoom`, `useJoinRoom` — all already in `lib/use-rooms.ts`) doesn't change at all; this is purely `(protected)/layout.tsx` and `(protected)/page.tsx` being restructured to render the list as a persistent sidebar instead of `page.tsx`'s current full-page content.
- Active room in the sidebar list: `bg-accent-subtle text-accent` row, using the existing `useParams` room id already available via the layout tree.

This is the largest single item in this document. It's also the one most worth doing first from a "does this app feel like a real product" standpoint — everything else is polish on top of screens that already exist; this changes the navigation model itself.

### 4.3 Chat room (message pane + composer)

Internal structure is sound — keep the scroll container, the `hasNextPage` "Load older messages" affordance, and the WS-driven state from `use-room-socket.ts` exactly as built. Apply component-level changes only:

- Message bubbles get the sender-attribution treatment (§3.6).
- Composer input becomes a `Field` variant (or stays a plain styled input — it's a single field, extraction isn't necessary here) with a visible character counter once the draft nears `maxLength={4000}` (e.g. only render a `text-xs text-text-muted` counter once `draft.length > 3500`, right-aligned above the input — don't show it at 0 characters, that's noise).
- Send button: disabled state (`connectionState !== "open"`) should say *why* — swap the button label to "Reconnecting…" while `connecting`, instead of just being inertly disabled with no explanation.
- Wrap the message list container in `aria-live="polite" aria-relevant="additions"` (new) so screen reader users are told when a message arrives, matching what sighted users already see happen live.

### 4.4 Responsive breakpoints

No custom breakpoints — Tailwind defaults (`sm` 640 / `md` 768 / `lg` 1024) are sufficient. The only breakpoint-dependent behavior this system introduces is the sidebar/main-pane split in §4.2 at `md`.

---

## 5. Accessibility requirements

Everything here is new — the current app has no accessibility-specific work beyond (correctly) pairing every `<label>` to its `<input>`. In priority order:

1. **Focus visibility** — currently zero custom focus styles anywhere; Tailwind's preflight removes the browser default outline and nothing replaces it, so keyboard users cannot tell what's focused. Fixed globally by the `:focus-visible` rule in `tokens.css` (§2.1) — no per-component work required once that lands.
2. **Live regions** — connection status (§3.8), typing indicator (§3.9), and incoming messages (§4.3) currently update visually with no announcement to assistive tech. Three `aria-live="polite"` regions, all called out above.
3. **Error association** — form field errors need `aria-describedby` + `aria-invalid` (§3.2); currently the error text exists visually but isn't linked to its input.
4. **Color is never the only signal** — the Alert component (§3.10) needs an icon alongside color; the connection pill (§3.8) has both color and text, keep it that way.
5. **Touch targets** — current buttons are `py-2` (~36px tall including line-height). Bump primary/composer buttons to a `py-2.5` (~40px) minimum; secondary/inline buttons (`sm` size, §3.1) can stay smaller since they're not primary mobile targets.
6. **Contrast** — `brand-600` (`oklch(0.53 0.19 264)`) against white and `text-on-brand` white against `brand-600`/`brand-500` should both be verified at implementation time with a contrast checker (Chrome DevTools' color picker shows this live); OKLCH lightness values were chosen to be comfortably in AA range but weren't run through a formal checker as part of writing this document.

---

## 6. Current-state audit

For context on why the items above were prioritized the way they are:

| Category | Finding |
|---|---|
| Color tokens | None defined beyond `--background`/`--foreground`. ~20+ instances of hand-typed `zinc-50/400/500/600/950`, `black/10`, `white/10`, `red-600/400` spread across 5 files (`login`, `register`, `(protected)/layout`, `(protected)/page`, `rooms/[roomId]/page`). No brand/accent color anywhere — every "primary" action is literally black or white. |
| Typography | `--font-sans` is defined and wired to Geist via `next/font`, but `body` hardcodes `Arial, Helvetica, sans-serif` instead — the loaded font is never actually applied. Font sizes are already consistently restricted to `text-xs`/`text-sm`/`text-lg`/`text-xl` — no violations found here. |
| Radius | Inconsistent: bare `rounded` (4px) on most controls, `rounded-lg` (8px) on the two auth-form cards, with no evident logic to the split. |
| Shadow / motion | Zero shadows, zero transitions anywhere in the app, including on hover states that clearly want one (`hover:bg-black/3` with an instant snap instead of a fade). |
| Repeated markup | The label+input+error block appears 7 times near-verbatim across `login`/`register`. The primary/secondary button classNames appear 8+ times near-verbatim. Both are extraction candidates (§3.1, §3.2). |
| Accessibility | No custom focus styles anywhere. No `aria-live` regions (connection state, typing, new messages all update silently for assistive tech). Form errors aren't linked to their inputs via ARIA. |
| Functional UX gap | Messages from other users in a room show no sender identity — only "mine" vs. "not mine." In any room with 3+ members this makes incoming messages ambiguous. (§3.6) |
| Navigation | Room list and an open room are disconnected full-page routes with no persistent context — the biggest structural gap (§4.2). |

---

## 7. Implementation handoff

Suggested order — each phase is independently shippable, and later phases depend on earlier ones only where noted.

### Phase 1 — Tokens (foundation, do first)
- Merge [`tokens.css`](./tokens.css) into `app/globals.css` per the instructions at the top of that file.
- Verify the app still renders correctly in both light and dark mode after the merge (this is a pure additive/rename change, no visual change expected yet since nothing consumes the new tokens until Phase 2+).

### Phase 2 — Primitives
- Extract `Button` (§3.1), `Field` (§3.2), `Card` (§3.3), `Badge` (§3.4), `Alert` (§3.10) as components under a new `frontend/components/` directory.
- Re-point `login/page.tsx` and `register/page.tsx` at them. This phase alone should make both auth screens visibly on-brand (accent-colored primary buttons, filled input backgrounds, visible focus rings) with no other behavior change.

### Phase 3 — Room list & chat polish
- Add `Avatar` (§3.5), `Checkbox` styling (§3.11), swap `(protected)/page.tsx`'s buttons/badges to the Phase 2 primitives.
- Add sender attribution to message bubbles (§3.6) — check first whether `GET /rooms/{room_id}/messages` already returns a joined username; if not, this phase blocks on a small backend addition.
- Add the connection status pill (§3.8) and typing-indicator animation (§3.9) to `rooms/[roomId]/page.tsx`.

### Phase 4 — App shell restructure
- The sidebar/main-pane rework (§4.2). Larger and more structural than Phases 1–3, so sequenced after the primitives it depends on (`Card`, `Badge`, `Avatar`) already exist. No route or data-layer changes — `lib/use-rooms.ts`, `lib/use-room-messages.ts`, `lib/use-room-socket.ts` are all unaffected.

### Phase 5 — Accessibility & finishing
- The three `aria-live` regions (§5.2), `aria-describedby`/`aria-invalid` on form fields (§5.3), touch-target sizing pass (§5.5).
- Loading skeletons (§3.13) — lowest priority, nice-to-have.
- Manual contrast check on `accent`/`text-on-brand` pairs (§5.6).

---

*Written against the codebase as of the commit where this file was added. If the frontend has moved on since, re-check §6's audit findings before treating them as current.*
