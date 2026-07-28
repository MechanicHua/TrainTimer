# TrainTimer Solve Detail Override

> **Scope:** `#solveDialog` result summary and CFOP stage analytics  
> **Parent:** `design-system/traintimer/pages/dialogs.md`

## Information hierarchy

1. Result time and solve context.
2. Two-view stage analytics: comparison and time share.
3. Existing replay/CFOP detail.
4. Existing editable solve metadata.
5. Sticky copy/save/delete actions.

## Stage comparison

- Aggregate saved stages into Cross, F2L (F1–F4), OLL and PLL.
- Position uses percentage difference from the average of valid prior 3x3 CFOP solves.
- A white diamond marks the historical average; a circular light point marks the current result.
- Show 21 clock-like ticks. Five major ticks are long and bright; minor ticks are short and dim.
- The axis has no pill or racetrack enclosure.
- Beam brightness is uniform from average to current. Glow diffusion stays within the nearby axis and ticks.
- Faster/slower exact time remains plain text with no frame or filled badge.

## Time share

- Use a single horizontal four-segment line.
- Stage names sit above the line; percentages sit below it; cumulative times use a lower baseline.
- Do not repeat stage values in four cards.
- Use position, text, boundary shapes and color together.

## Motion

- 150–300ms, transform/opacity only for UI transitions.
- Comparison points travel from average to current while the beam reveals from the average marker.
- The share line reveals once from left to right.
- No looping glow or decorative pulse after settling.
- Tab switches keep a stable viewport height.
- Disable movement and loading rotation under `prefers-reduced-motion`.

## Responsive and accessibility

- Validate at 390, 768, 1024 and 1440px.
- Keep all 21 ticks on narrow screens but reduce numeric labels to the two endpoints and zero.
- Tabs use `tablist`/`tab`/`tabpanel`, arrow-key navigation and visible focus.
- Every visual row has a visible and screen-readable numeric summary.
- Preserve 44px minimum interactive targets and prevent horizontal overflow.
