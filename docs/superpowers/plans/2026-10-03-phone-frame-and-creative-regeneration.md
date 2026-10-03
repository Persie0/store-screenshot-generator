# Phone Frame Color and Creative Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-selected and manually overridable phone-frame colors plus suggestion-driven per-screen creative regeneration without changing original screenshots or crop transforms.

**Architecture:** Keep phone-color validation/resolution and regeneration state transitions in small pure modules. Gemini analysis/regeneration stays in `studio.ts`; `app.ts` only orchestrates UI, persisted API-key reuse, project saves, and exact preview/export. Preview and export continue through `renderStoreAsset`, now with an explicit resolved phone-frame color.

**Tech Stack:** TypeScript 5.9, Vite 8, browser Canvas/IndexedDB/localStorage, Google Gemini Interactions API, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-03-phone-frame-and-creative-regeneration-design.md`

## Global Constraints

- English remains the source/default language.
- Original screenshot blobs and crop transforms are never modified by regeneration.
- Manual phone color always overrides AI color and AI never switches Manual back to Auto.
- Auto phone color resolves screen AI color first, then `#111521`.
- Manual phone color resolves valid project manual color first, then `#111521`.
- Valid colors are six-digit `#RRGGBB` values.
- Regeneration may update only copy, per-screen phone color, layout mood, and palette.
- Successful regeneration invalidates translations only for the regenerated screen and returns the project to `needs-approval`.
- Selected localization targets, imported locale metadata, project API-key behavior, original blob metadata, dimensions, and crop transforms are preserved.
- Failed regeneration leaves project state unchanged.
- API keys stay in browser storage only and never enter project data or ZIP backups.
- Legacy projects load without an IndexedDB schema-version change.
- Exact preview and export use the same renderer and resolved presentation values.
- No GitHub Actions are added.
- Final gate: `npm test && tsc --noEmit && vite build`.

## Review Focus

1. Invalid/missing AI color must not break analysis or rendering; it falls back safely while valid copy survives.
2. Manual mode must survive fresh analysis/regeneration and continue overriding new AI suggestions.
3. Regenerating one screen must not clear translations or presentation overrides belonging to other screens.
4. An unchanged Gemini result must be rejected unless at least one supported visual field changed meaningfully.
5. Legacy projects with no frame settings or per-screen presentation fields must render exactly with the current `#111521` frame fallback.

---

### Task 1: Phone-frame color model and project persistence

**Files:**
- Create: `src/phone-frame.ts`
- Create: `src/phone-frame.test.ts`
- Modify: `src/storage.ts`
- Modify: `src/storage.test.ts`

**Interfaces:**
- Produces:
  - `export const DEFAULT_PHONE_COLOR = '#111521'`
  - `export type PhoneColorMode = 'auto' | 'manual'`
  - `export function normalizeHexColor(value: unknown): string | undefined`
  - `export function normalizePhoneColorMode(value: unknown): PhoneColorMode`
  - `export function resolvePhoneColor(mode: PhoneColorMode | undefined, manualColor: string | undefined, aiColor: string | undefined): string`
  - `Project.phoneColorMode?: PhoneColorMode`
  - `Project.phoneColor?: string`
- Consumes: existing `Project`, `normalizeProject`, and `projectManifest` persistence flow.

- [ ] **Step 1: Write failing color-model tests**
  - valid six-digit hex is retained and normalized consistently
  - malformed/short/alpha hex is rejected
  - missing/invalid mode becomes `auto`
  - manual valid color beats AI color
  - auto uses AI color
  - invalid/missing colors fall back to `#111521`

- [ ] **Step 2: Run `npm test -- --test-name-pattern="phone frame|phone color"` and verify RED**
  Expected: failures because `phone-frame.ts` and project fields do not exist.

- [ ] **Step 3: Implement the pure color helpers in `src/phone-frame.ts`**
  Keep this module dependency-free so `storage.ts`, `studio.ts`, rendering, and UI can all reuse the same validation rules.

- [ ] **Step 4: Add failing storage tests**
  Assert legacy projects normalize to Auto behavior, invalid manual colors are dropped, valid Manual settings persist, and `projectManifest()` includes `phoneColorMode`/`phoneColor` but no API key.

- [ ] **Step 5: Extend `Project`, `normalizeProject`, and `projectManifest` in `src/storage.ts`**
  Do not change `DB_VERSION`.

- [ ] **Step 6: Run `npm test` and verify GREEN**

- [ ] **Step 7: Commit**
  `git commit -m "feat: add persisted phone frame color settings"`

---

### Task 2: Pure creative presentation and regeneration state transitions

**Files:**
- Create: `src/creative-state.ts`
- Create: `src/creative-state.test.ts`
- Modify: `src/app-state.ts` only if shared copy helpers need delegation

**Interfaces:**
- Consumes: `Project`, `ScreenCopy`, `Palette`, `LayoutMood`, and Task 1 phone-color helpers.
- Produces:
  - `export type ScreenPresentation = { phoneColor: string; palette: Palette; mood: LayoutMood }`
  - `export function resolveScreenPresentation(project: Project, shotId: string, fallbackPalette: Palette): ScreenPresentation`
  - `export function setPhoneColorMode(project: Project, mode: PhoneColorMode, now: number): Project`
  - `export function setManualPhoneColor(project: Project, color: string, now: number): Project`
  - `export function applyRegeneratedCreative(project: Project, shotId: string, creative: ScreenCopy, now: number): Project`

- [ ] **Step 1: Write failing presentation/state tests**
  Assert per-screen palette/mood overrides beat project analysis values, Manual frame color beats screen AI color, Auto uses screen AI color, and legacy fallbacks remain deterministic.

- [ ] **Step 2: Write failing regeneration mutation tests**
  For one regenerated screen assert:
  - analysis entry and matching English `ProjectShot` copy update
  - `englishApproved=false`, `status='needs-approval'`
  - only that screen is removed from every locale translation map
  - other screens/translations remain unchanged
  - crop transform, blob, dimensions, locale selections, `phoneColorMode`, and `phoneColor` are preserved
  - unknown shot ID returns the original project unchanged

- [ ] **Step 3: Run `npm test -- --test-name-pattern="creative|regenerat|phone frame"` and verify RED**

- [ ] **Step 4: Implement `src/creative-state.ts` as immutable pure operations**
  Do not call storage, Gemini, DOM APIs, time, random IDs, or renderer code from this module.

- [ ] **Step 5: Run focused tests and then `npm test` to verify GREEN**

- [ ] **Step 6: Commit**
  `git commit -m "feat: add creative presentation state transitions"`

---

### Task 3: Gemini phone-color analysis and suggestion-aware creative regeneration

**Files:**
- Modify: `src/studio.ts`
- Modify: `src/studio.test.ts`

**Interfaces:**
- Extend `ScreenCopy` with optional `phoneColor?: string`, `layoutMood?: LayoutMood`, `palette?: Palette`.
- Produce:
  - `export async function regenerateScreenCreative(apiKey: string, appName: string, analysis: Analysis, screenshot: ScreenshotInput, suggestion: string, fetcher?: typeof fetch, onProgress?: GeminiProgressCallback): Promise<ScreenCopy>`
- Keep `regenerateScreenCopy(...)` as a compatibility wrapper only if existing callers/tests still use it during migration.

- [ ] **Step 1: Add failing initial-analysis tests**
  Capture the Gemini prompt/response and assert it requests per-screen `phoneColor`, retains a valid `#RRGGBB`, and safely ignores an invalid color without rejecting otherwise valid analysis.

- [ ] **Step 2: Add failing regeneration tests**
  Assert the request includes the exact user suggestion, current copy, detected UI text, visual context, and asks for `phoneColor`, optional `layoutMood`, and optional `palette`.

- [ ] **Step 3: Add validation/meaningful-change tests**
  Assert:
  - empty suggestion still asks for a clearly different alternative
  - valid returned visual fields survive
  - invalid returned color is ignored/preserved safely
  - invalid mood/palette resolve to prior/global-safe values rather than poisoning state
  - identical copy plus identical supported visual fields rejects with a readable retry error
  - identical copy with a genuinely changed supported visual field is accepted

- [ ] **Step 4: Run `npm test -- --test-name-pattern="analysis.*phone|regenerat"` and verify RED**

- [ ] **Step 5: Update `analyzeScreenshots` prompt and sanitize returned per-screen `phoneColor`**
  Reuse Task 1 hex validation; invalid color must not fail the entire analysis.

- [ ] **Step 6: Implement `regenerateScreenCreative`**
  Sanitize returned presentation fields. Use previous per-screen values as fallback where appropriate; global project analysis remains the renderer fallback when no per-screen override exists.

- [ ] **Step 7: Run focused tests and full `npm test` to verify GREEN**

- [ ] **Step 8: Commit**
  `git commit -m "feat: regenerate creative direction from suggestions"`

---

### Task 4: Render configurable phone-frame color with exact preview/export parity

**Files:**
- Modify: `src/render.ts`
- Modify: `src/render.test.ts`
- Modify: `src/export-plan.ts` / `src/export-plan.test.ts` only if render options are routed there instead of directly by `app.ts`

**Interfaces:**
- Consumes: Task 1 color helper.
- Extend renderer with a backward-compatible final options parameter:
  - `export type RenderStoreAssetOptions = { phoneColor?: string }`
  - `renderStoreAsset(shot, copy, palette, size, deviceType, mood, options?: RenderStoreAssetOptions): Promise<Blob>`

- [ ] **Step 1: Write failing renderer tests**
  Use a minimal fake canvas context or extracted pure helper to assert the supplied `phoneColor` is used for both outer and inner device frame fills, while omitted/invalid options resolve to `#111521`.

- [ ] **Step 2: Run renderer tests and verify RED**

- [ ] **Step 3: Replace the hard-coded `#111521` frame fills with the resolved renderer option**
  Do not change screenshot crop/rotation/contain behavior.

- [ ] **Step 4: Add/adjust parity regression coverage**
  Assert all app preview/export call sites use `resolveScreenPresentation(...)` and the same `renderStoreAsset(...)` path rather than duplicate rendering logic.

- [ ] **Step 5: Run `npm test` and verify GREEN**

- [ ] **Step 6: Commit**
  `git commit -m "feat: render configurable phone frame colors"`

---

### Task 5: Phone-frame controls and regeneration modal UI

**Files:**
- Modify: `src/app-view.ts`
- Modify: `src/app-view.test.ts`
- Modify: `src/app-features.css`
- Modify: `src/app-entry.test.ts`

**Interfaces:**
- Consumes: project frame mode/color and per-screen AI color.
- UI contracts:
  - `[data-phone-mode="auto"]`
  - `[data-phone-mode="manual"]`
  - `#phone-color-picker`
  - `#phone-color-hex`
  - `#phone-color-error`
  - `#reset-phone-color`
  - `#regenerate-creative`
  - modal textarea `#regenerate-suggestion`
  - primary action `#run-regeneration`

- [ ] **Step 1: Add failing `app-view` tests**
  Assert the active screen renders a compact Phone frame panel with Auto/Manual state, resolved color swatch/hex, AI-suggestion copy in Auto, native picker + editable hex in Manual, Reset to Auto, and Regenerate creative action.

- [ ] **Step 2: Add failing modal markup/wiring smoke assertions**
  Pin heading “Regenerate this creative”, explanation that screenshot/crop stay unchanged, suggestion textarea, example suggestions, cancel, and primary Regenerate action.

- [ ] **Step 3: Run focused view/entry tests and verify RED**

- [ ] **Step 4: Implement view markup and responsive styles**
  Keep controls keyboard accessible and avoid introducing another API-key field.

- [ ] **Step 5: Run focused tests and full `npm test` to verify GREEN**

- [ ] **Step 6: Commit**
  `git commit -m "feat: add phone frame and regenerate controls"`

---

### Task 6: Wire project settings, regeneration, persisted key reuse, and exact previews

**Files:**
- Modify: `src/app.ts`
- Modify: `src/app-entry.test.ts`
- Modify: `src/api-key.test.ts` only if a regression around reuse is needed

**Interfaces:**
- Consumes Tasks 1–5: `setPhoneColorMode`, `setManualPhoneColor`, `resolveScreenPresentation`, `applyRegeneratedCreative`, `regenerateScreenCreative`, and renderer options.

- [ ] **Step 1: Add failing app-entry wiring assertions**
  Pin that preview/export resolve presentation per active/job screen, phone controls persist immediately, Reset switches to Auto without deleting saved manual value, and regeneration uses the existing loaded/persisted `apiKey` path.

- [ ] **Step 2: Wire phone mode changes**
  Auto/Manual updates project state and rerenders immediately. Manual input saves only valid six-digit hex values; invalid text leaves the last valid value unchanged and displays inline feedback.

- [ ] **Step 3: Wire exact preview/export presentation**
  For every screenshot render, call `resolveScreenPresentation(project, shot.id, defaultPalette)` and pass its palette, mood, and phoneColor to `renderStoreAsset`.

- [ ] **Step 4: Wire regeneration modal and request flow**
  On Regenerate: ensure/reuse saved API key; if unavailable use the existing key dialog; call `regenerateScreenCreative` using the original screenshot blob and suggestion; do not mutate project state before the request succeeds.

- [ ] **Step 5: Apply successful regeneration atomically**
  Use `applyRegeneratedCreative`, set active locale to `en`, persist/reload, stay on the same screenshot, and rerender exact preview. On failure, restore/show the prior editor state with a readable error and no partial mutation.

- [ ] **Step 6: Add integration regressions**
  Assert Manual color survives regeneration, regenerated screen translations alone are invalidated, crop/source metadata remains identical, and a translated current locale returns to English after successful regeneration.

- [ ] **Step 7: Run `npm test` and verify GREEN**

- [ ] **Step 8: Commit**
  `git commit -m "feat: wire AI creative regeneration and phone colors"`

---

### Task 7: Persistence/export regression audit and strict release gate

**Files:**
- Modify tests only where uncovered behavior remains: `src/storage.test.ts`, `src/studio.test.ts`, `src/render.test.ts`, `src/app-entry.test.ts`
- Modify `README.md` only if its user-facing feature description is now stale.

**Interfaces:** None new.

- [ ] **Step 1: Audit acceptance criteria against tests**
  Confirm each of the ten spec acceptance criteria has at least one explicit test.

- [ ] **Step 2: Pin the five Review Focus cases**
  Ensure tests cover invalid AI color, Manual precedence through regeneration, selective translation invalidation, meaningful-change rejection, and legacy fallback rendering.

- [ ] **Step 3: Inspect project manifest/backup output**
  Confirm frame settings and per-screen AI presentation metadata round-trip while API key remains absent.

- [ ] **Step 4: Inspect the full diff**
  Confirm no image-generation model/source-pixel replacement, crop mutation, cloud persistence, backend dependency, per-locale visual styles, or GitHub Actions were introduced.

- [ ] **Step 5: Run the strict final gate**
  Run: `npm test && tsc --noEmit && vite build`
  Expected: exit code 0 with all tests passing and Vite build completing.

- [ ] **Step 6: Verify the deployed preview for the exact final commit**
  Confirm Vercel reaches `READY`; do not claim production success from an older deployment.

- [ ] **Step 7: Commit any final regression/doc-only changes**
  `git commit -m "test: cover phone frame and regeneration regressions"`
