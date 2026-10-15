# Hisab — Project Guide

A shop point-of-sale / inventory / supplier / reports app for a Bangladeshi computer accessories and servicing shop. React 19 + TypeScript + Vite frontend, Cloudflare Worker + D1 backend. See [README.md](README.md) and [deployment.md](deployment.md) for setup.

## Design directions

These principles were derived from the existing code (`src/*.css`, `src/i18n.ts`, `src/Receipt.tsx`, `worker/`, README). Follow them when adding or changing UI.

### 1. Counter-first, keyboard-driven utility
- This is a working tool for a cashier at a busy counter, not a marketing site. Speed and clarity beat decoration.
- Primary flows (search → select item → price/quantity → payment) must be reachable by keyboard: F2 search, ↑/↓ navigation, Enter confirm, `+` payment, Alt+B / Alt+C, Esc closes dialogs, `?` shows shortcuts. Show `<kbd>` hints on primary actions.
- Sale steps are explicit and linear ("Choose item → Set price & quantity → Take payment").

### 2. Calm, dense, ledger-like layout
- Warm off-white "paper" background (`--paper #e9e7de`, `--white #fcfcfa`, ink `#22231f`) with thin hairline borders (`--line`, `--card-border`) instead of heavy shadows or gradients.
- Dense but readable: shared density tokens in `styles.css` (`--workspace-gutter`, `--panel-inset`, `--row-height: 60px`, `--body-size: 14px`, `--detail-size: 11px`). Every view uses the same scale; reuse tokens rather than inventing new sizes.
- Structure: fixed slim sidebar, topbar, page heading (eyebrow + large tight-tracked title), panels with 52px headings, tables with small uppercase column heads, and a workspace footer.
- Numbers, bill numbers and codes use the monospace face (`IBM Plex Mono`); body text uses `DM Sans Variable`.

### 3. One green accent, semantic status colors
- Single brand accent: green (`--accent #00853E`, `--accent-ink`, `--accent-selected`). Use it for primary actions, focus and selection only.
- Status uses semantic soft/border triplets: success, warning (amber), danger (red). Never hard-code colors; use variables from [src/theme.css](src/theme.css).
- Toasts are solid green/red with a left accent border; destructive actions offer Undo where possible.

### 4. Light and dark parity
- All colors flow through CSS variables; dark theme is defined via `:root[data-theme="dark"]` / `.dark` (neutral grays `#1e1e20–#2d2d30`, mint accent `#78d99e`).
- Theme is applied before first paint (`public/theme-init.js`). New components must be checked in both themes.
- Receipts and PDFs keep their own fixed paper palette regardless of theme.

### 5. Accessibility is non-negotiable
- Visible `:focus-visible` rings using `--focus`; secondary text must meet contrast (`--text-secondary`).
- Native `<dialog>` for modals (focus containment, inert background), skip link, `sr-only` labels, forced-colors support, `aria-*` on navigation.
- Respect `prefers-reduced-motion`; motion is only added inside `@media (prefers-reduced-motion: no-preference)`.

### 6. Restrained, purposeful motion
- Short feedback only: `--motion-fast: 120ms`, `--motion-standard: 160ms`, easing `cubic-bezier(.2,.75,.3,1)`.
- Motion confirms an action (focus underline sweep, row feedback bar, small translate). Keep text stable, avoid layout shift and permanent layer promotion (`will-change`). See [src/motion.css](src/motion.css).

### 7. Bilingual by design (English + Bangla)
- All user-facing strings live in [src/i18n.ts](src/i18n.ts) (plus `reportsCopy.ts`, `suppliersCopy.ts`); never hard-code text in components.
- Bangla uses `Noto Sans Bengali Variable` with normal letter-spacing and kerning (`.lang-bn`). Layouts must tolerate longer Bangla strings.
- Plain, shopkeeper-friendly wording ("Counter", "Stock", "Customers", "Take payment") over accounting jargon.
- Currency is whole Taka (৳); dates use Asia/Dhaka.

### 8. Honest, trustworthy feedback
- The UI never claims success before backend confirmation; failures, stale revisions and interrupted responses are surfaced explicitly and require review before retry.
- Uncertain historical accounting is shown as unavailable rather than guessed. Connection status is visible ("Connected" / "Connection issue").
- Destructive or irreversible actions require reasons/confirmation (voids, returns, archive instead of delete).

### 9. Responsive, desktop-first
- Optimised for desktop counters, with breakpoints at 1600, 1200, 900 and 680px (sidebar shrinks 88 → 72 → 54px) and a short-height (≤800px) compact mode. Mobile must remain usable.

### 10. Print and brand identity
- The A4 cash memo ([src/receipt.css](src/receipt.css), `ReceiptArt.tsx`) is a core brand artifact: 210×297mm grid layout in millimetres, green/navy brand palette, `Russo One` shop title, payment logos (bKash, Nagad, Rocket) and equipment illustration. Do not alter proportions casually; verify with print and PDF previews (`output/`).
- Reports export to PDF, CSV/JSON and spreadsheets with the same branding (`reportBrand.ts`, `reportPdf*.ts`).

### 11. Implementation conventions
- Styles are plain CSS files per area (`styles.css`, `theme.css`, `motion.css`, `navigation.css`, `reports.css`, `suppliers.css`, `login.css`, `receipt.css`, `web-accessibility.css`). Later files refine earlier ones; extend variables and the existing class vocabulary instead of adding a UI library.
- Inline SVG icons from [src/Icons.tsx](src/Icons.tsx); no icon fonts or external images at runtime (strict CSP in `public/_headers`).
- Prefer self-hosted `@fontsource` fonts; no CDN assets.
- Add tests (`npm test`, plus `test:pricing-ui` / `test:web-ui` for UI) when changing money, receipts, or core flows.
