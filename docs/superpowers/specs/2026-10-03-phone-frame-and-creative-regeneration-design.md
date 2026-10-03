# Phone Frame Color and Creative Regeneration Design

Date: 2026-10-03

## Goal

Extend Frame so generated store creatives can use an AI-selected phone-frame color, while still allowing the user to override that color manually. Also add a per-screen “Regenerate creative” flow where the user can enter a free-text suggestion and ask Gemini to produce a new creative direction for that generated store image without changing or re-uploading the original screenshot.

The feature must preserve the existing browser-only architecture, exact preview/export parity, English-first translation workflow, non-destructive crop behavior, and locally persisted Gemini API key behavior.

## User-visible behavior

### Phone frame color

Each project exposes a Phone frame control in the editor.

The user can choose:

- **Auto (AI)** — the generated image uses the AI-suggested phone-frame color for the active screenshot.
- **Manual** — the user selects a color with a native color picker and editable hex field. The manual color applies consistently to every generated screenshot in the project.
- **Reset to Auto** — returns to the AI suggestion without deleting the saved manual color value.

The exact preview updates immediately when the setting changes, and export uses the exact same resolved color.

Manual always wins. AI analysis or later regeneration may update the AI suggestion but must never overwrite the user’s manual choice or silently switch the project back to Auto.

### AI-selected frame color

Initial Gemini screenshot analysis returns a `phoneColor` recommendation for each screenshot. The color should complement the source screenshot and the generated background while keeping the device boundary visually distinct.

A valid AI color is a six-digit hex value (`#RRGGBB`). Invalid or missing values fall back to the current dark frame color (`#111521`).

Auto mode resolves the frame color in this order:

1. active screen’s valid AI `phoneColor`
2. `#111521`

Manual mode resolves the frame color in this order:

1. valid project `phoneColor`
2. `#111521`

### Regenerate creative with a suggestion

Each screenshot gets a **Regenerate creative** action. It opens a modal containing a free-text suggestion field and examples such as:

- “Make it feel more premium.”
- “Focus on the analytics benefit.”
- “Use shorter copy and a lighter phone frame.”
- “Make this more playful.”

The suggestion may be empty; an empty suggestion means “create a clearly different alternative.”

Regeneration operates only on the selected screenshot. Gemini receives:

- the original screenshot image
- the app/project name
- current app analysis context
- current English copy
- previously detected screenshot UI text
- the user’s free-text suggestion
- current visual context

Gemini returns a fresh per-screen creative recommendation:

- `headline`
- `subheadline`
- `detectedText`
- `overlapWarning`
- `phoneColor`
- optional `layoutMood`
- optional `palette`

This means regeneration can alter not only copy but also the active screenshot’s generated presentation when the user asks for a visual direction change. The original uploaded screenshot and crop transform remain untouched.

## Data model

### `ScreenCopy`

Extend the existing screen-analysis model with optional presentation fields:

```ts
export type ScreenCopy = {
  id: string;
  headline: string;
  subheadline: string;
  detectedText: string[];
  overlapWarning: string;
  phoneColor?: string;
  layoutMood?: LayoutMood;
  palette?: Palette;
};
```

These optional fields are backward-compatible with existing saved projects.

### `Project`

Extend project state with:

```ts
phoneColorMode?: 'auto' | 'manual';
phoneColor?: string;
```

Normalization rules:

- missing mode becomes `auto`
- invalid mode becomes `auto`
- `phoneColor` is retained only when it is a valid six-digit hex color
- legacy projects continue to load without migration or IndexedDB version change

The project manifest must include these fields so backups round-trip correctly.

## Rendering

Add pure helpers for color validation and resolution, rather than embedding precedence rules in `app.ts` or `render.ts`.

Suggested interface:

```ts
export function normalizeHexColor(value: unknown): string | undefined;
export function resolvePhoneColor(
  projectMode: 'auto' | 'manual' | undefined,
  manualColor: string | undefined,
  aiColor: string | undefined,
): string;
```

`renderStoreAsset` receives the resolved phone frame color explicitly or through a small render-options object. It must stop hard-coding `#111521` for the outer and inner device frame.

The exact editor preview and every exported store asset must use the same resolved color and same renderer.

For per-screen visual regeneration, the caller resolves:

- palette: regenerated screen override → project analysis palette → current default palette
- layout mood: regenerated screen override → project analysis mood → `editorial`
- phone color: project manual override → regenerated/AI screen color → `#111521`

This preserves project-wide consistency by default but allows a regeneration suggestion to make a single generated image visually different when requested.

## Gemini analysis changes

The initial `analyzeScreenshots` prompt changes its screen schema to include `phoneColor`:

```json
{
  "id": "...",
  "headline": "...",
  "subheadline": "...",
  "detectedText": ["..."],
  "overlapWarning": "...",
  "phoneColor": "#RRGGBB"
}
```

The prompt instructs Gemini to choose a device-frame color that complements the screenshot and generated palette but remains visibly separated from the screenshot content/background.

Returned values are sanitized locally. Invalid colors do not make the whole analysis fail; they fall back during rendering.

## Creative regeneration API

Replace or evolve the existing `regenerateScreenCopy` helper into a suggestion-aware creative regeneration function. Keep a compatibility wrapper only if tests or existing code still require the old name.

Suggested interface:

```ts
export async function regenerateScreenCreative(
  apiKey: string,
  appName: string,
  analysis: Analysis,
  screenshot: ScreenshotInput,
  suggestion: string,
  fetcher?: typeof fetch,
  onProgress?: GeminiProgressCallback,
): Promise<ScreenCopy>;
```

The Gemini prompt requires a meaningfully different result and explicitly includes the user suggestion. It asks for only supported visual controls: copy, frame color, layout mood, and palette. It must not invent new app features or modify the source screenshot.

Returned `layoutMood`, `palette`, and `phoneColor` are validated with the same local validators already used for analysis.

If Gemini returns the same headline/subheadline and no meaningful visual change, regeneration fails with a readable retry message rather than pretending a new variation was generated.

## Regeneration state flow

When regeneration succeeds for a selected screen:

1. replace the corresponding `analysis.screens` entry with the regenerated result
2. copy regenerated English headline/subheadline to the matching `ProjectShot`
3. set `englishApproved = false`
4. set project status to `needs-approval`
5. remove stale translations for that screen from every locale, preserving translations for other screens
6. preserve crop transform, source blob, source dimensions, imported locale selections, and project phone-color mode/manual value
7. save the project locally
8. rerender the editor using the regenerated per-screen visual overrides

This ensures translated copy is never silently left based on old English text.

## UI design

### Phone frame section

Place a compact “Phone frame” panel near the preview controls or other visual-generation controls. It contains:

- Auto (AI) / Manual segmented choice
- color swatch and current resolved hex
- in Auto mode: “AI suggestion for this screen”
- in Manual mode: native color picker plus editable hex input
- “Reset to Auto” action

All controls are keyboard accessible and persist immediately.

### Regenerate action

Add **Regenerate creative** near the active screenshot’s preview/copy controls.

Modal contents:

- heading: “Regenerate this creative”
- short explanation that the original screenshot and crop stay unchanged
- textarea for suggestion
- a few non-clickable or clickable example suggestions
- primary “Regenerate” button
- cancel/close action

During the Gemini request, show the existing progress UI. On success, return to the same screenshot with the new creative visible. On error, preserve the prior creative and show the error without partial mutation.

## API-key behavior

Regeneration uses the already persisted/reused Gemini API key. If no usable key exists, use the existing API-key dialog. Saving a key there continues to update browser storage. Do not introduce a separate key field for regeneration.

## Translation behavior

English remains the source/default language.

A regenerated English screen invalidates only translations for that screen. The project returns to `needs-approval` until the user approves English and translates again. Existing selected translation locales remain unchanged.

If the user is viewing a translated locale when regeneration starts, the app returns to English for the regenerated screen so the source change is visible.

## Persistence and backups

Project save/load normalization and `projectManifest` include:

- `phoneColorMode`
- `phoneColor`
- per-screen AI presentation fields already inside `analysis.screens`

No API key is ever included in project data or project ZIP backups.

No IndexedDB schema migration is needed because project values are stored as objects and the new fields are optional.

## Error handling

- invalid user-entered manual hex: do not save; keep last valid color and show inline feedback
- invalid AI phone color: ignore/fallback to `#111521`
- invalid AI palette/mood during regeneration: sanitize to existing/default values
- failed regeneration: leave project state unchanged
- missing API key: reuse saved browser key or open existing key dialog
- missing screen analysis: show a readable regeneration error rather than mutating the project

## Testing

Use TDD and the existing `node:test` build gate.

Required coverage:

### Color/state tests

- valid/invalid hex normalization
- legacy project defaults to Auto
- manual color overrides AI suggestion
- Auto uses screen AI suggestion
- fallback is `#111521`
- manual mode persists and round-trips through manifest
- AI regeneration never overwrites manual project mode/color

### Studio/Gemini tests

- initial analysis prompt requests `phoneColor`
- returned AI phone color is retained when valid
- invalid AI phone color is sanitized or safely ignored
- regeneration prompt contains the exact user suggestion
- regeneration returns and validates copy, frame color, layout mood, and palette
- empty suggestion still requests a meaningfully different result
- unchanged result is rejected

### App-state tests

- successful regeneration updates only selected screen analysis/copy
- marks English unapproved and status `needs-approval`
- clears only selected screen translations across locales
- preserves crop and original blob metadata
- preserves project locale selections and manual phone-color settings

### Renderer tests

- renderer uses supplied phone frame color rather than hard-coded dark frame
- preview and export go through the same render path
- legacy/no-color rendering falls back to `#111521`

### UI/entry wiring tests

- Phone frame Auto/Manual controls render
- manual picker/hex update project state
- Reset to Auto works
- Regenerate creative modal accepts a suggestion
- regeneration uses the persisted API key path
- current screenshot rerenders after success

The final strict gate remains:

```sh
npm test && tsc --noEmit && vite build
```

No GitHub Actions are added.

## Non-goals

This feature does not:

- generate or replace the uploaded screenshot pixels with an image-generation model
- create synthetic app UI
- modify crop transforms during regeneration
- add cloud storage or backend persistence
- store Gemini API keys in project data
- add per-locale independent visual styles

## Acceptance criteria

The feature is complete when:

1. initial analysis can provide an AI phone-frame color for each screen
2. Auto mode renders that AI color in exact preview and export
3. users can set one manual phone-frame color for the project and manual always overrides AI
4. users can reset back to Auto
5. users can regenerate the selected generated creative with a free-text suggestion
6. regeneration can update copy and supported visual presentation fields without altering the original screenshot/crop
7. stale translations for the regenerated screen are invalidated correctly
8. legacy projects continue to load and export
9. project backup/restore metadata contains the new settings but never the API key
10. the full local/Vercel build gate passes with no GitHub Actions added
