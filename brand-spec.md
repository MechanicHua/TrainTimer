# TrainTimer launcher brand specification

## Brand assets

- Native launcher icon source: `assets/TrainTimerIcon.png`
- Native launcher icon bundle: `TrainTimer.app/Contents/Resources/TrainTimerIcon.icns`
- Web compact browser mark: `public/favicon.png`

The launcher, Finder/Dock icon, launcher header, and browser tab all use the same native Apple Icon Composer Liquid Glass U/M cube T mark. The retired multicolor cube/timer artwork is not shipped.

## Visual language

- Product character: focused, precise, fast, dependable.
- Native platform character: quiet macOS utility rather than dashboard or marketing page.
- Primary interface color: the user-selected macOS accent color through `NSColor.controlAccentColor`.
- Status colors: semantic AppKit colors (`systemGreen`, `systemOrange`, `systemRed`, secondary label colors).
- Launcher mark palette: plate `#27333C` to `#090D11`, inactive cubies `#2A3740`, active cubies `#F7F9F9` to `#B8C5C9`, registration signal `#4C9FF0`.
- Use the launcher palette in the icon only; avoid turning the whole launcher into a branded multicolor surface.

## Type and spacing

- Use native San Francisco system typography so Dynamic Type, localization, contrast, and appearance changes remain system-correct.
- Use an 8-point spacing rhythm with 16/24/32-point group spacing.
- Prefer semantic system colors and Auto Layout; do not hard-code a light-only palette or fixed control heights.

## Interface constraints

- The primary task is opening the ready timer in Chrome.
- Starting, stopping, restarting, refreshing, copying the address, and revealing the log are secondary service-management actions.
- Preserve standard window controls, menu-bar commands, keyboard navigation, light/dark appearance, reduced transparency, and increased contrast behavior.
