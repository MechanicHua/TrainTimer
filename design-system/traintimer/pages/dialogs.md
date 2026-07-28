# TrainTimer Dialog System Override

> **Project:** TrainTimer  
> **Scope:** Every native HTML `<dialog>` in the timer UI  
> **Source:** `ui-ux-pro-max` design system + existing TrainTimer brand specification  
> **Stack:** Vanilla HTML, CSS and JavaScript (implemented with the skill's `html-tailwind` guidance translated into native CSS)

This page override supersedes the generated light landing-page recommendations in `MASTER.md`. TrainTimer is an existing dark desktop utility, so its established brand and interaction context take priority over generic palette matches.

## Product Context

- Product type: speedcubing training tool / productivity dashboard.
- Primary context: focused desktop practice, often under time pressure.
- Visual tone: quiet, precise, technical, compact and dependable.
- Density: 8/10. Motion: 3/10. Variance: 3/10.

## Dialog Tokens

| Role | Value |
|---|---|
| Shell | `rgba(24, 24, 29, 0.985)` |
| Raised surface | `rgba(255, 255, 255, 0.055)` |
| Hover surface | `rgba(255, 255, 255, 0.085)` |
| Border | `rgba(255, 255, 255, 0.12)` |
| Strong text | `#ffffff` |
| Body text | `#f5f5f7` |
| Secondary text | `#a7a7ae` |
| Primary action | existing user-selectable `--accent` token |
| Destructive | `#ff453a` plus text/icon, never color alone |
| Focus ring | 3px `--accent-focus` with visible border reinforcement |
| Radius | 18px shell, 12px sections, 10px controls |
| Spacing | 8px base; 12/16/20/24px grouping |

## Component Grammar

1. Each dialog uses one elevated shell, one sticky header and an optional sticky footer action bar.
2. Headers contain an 18px title, a concise 12–13px context line and a minimum 40px close control.
3. Body sections use subtle surface contrast and borders rather than nested heavy shadows.
4. Inputs have persistent labels, 44px minimum height, visible hover/focus states and inline `aria-live` errors where applicable.
5. Primary actions use the current accent color; destructive actions use red plus explicit wording.
6. Dense data dialogs may be wider, but must remain within `100dvh - 24px` and scroll internally.
7. Motion is limited to 160–220ms opacity/translate transitions and disabled under `prefers-reduced-motion`.
8. Responsive checks are required at 390px, 768px, 1024px and 1440px with no horizontal page scrolling.

## Accessibility Requirements

- Every dialog has `aria-labelledby` pointing to its visible heading.
- Native `<dialog>.showModal()` provides focus containment; closing remains reachable by keyboard.
- Focus indicators are never removed without a replacement.
- Click targets are at least 44px in content areas; dense table controls may be 40px on desktop only.
- Normal text maintains at least 4.5:1 contrast; metadata uses the stronger secondary token rather than low-opacity gray.
- Errors use text and `aria-live`, not red borders alone.

## Anti-patterns

- No purple/teal gradients unrelated to the selected accent.
- No oversized marketing typography inside utility dialogs.
- No hover scaling that causes layout shift.
- No placeholder-only field labels.
- No silent destructive actions or icon-only controls without accessible names.
