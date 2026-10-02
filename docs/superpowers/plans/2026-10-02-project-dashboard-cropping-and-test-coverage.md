# Project Dashboard, Screenshot Cropping, and Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make returning users land on a project dashboard, add a non-destructive multi-option screenshot crop editor with bulk application to matching screenshots, and add meaningful automated tests for every production TypeScript module without using GitHub Actions.

**Architecture:** Keep original screenshot blobs immutable and store normalized crop/transform metadata on each `ProjectShot`. Move crop geometry, render planning, project mutations, dashboard rendering, and crop-editor interactions into focused modules so `main.ts` becomes orchestration and can be integration-tested. Exact preview and ZIP export continue to share one renderer, and crop operations never call Gemini or invalidate analysis/translations.

**Tech Stack:** TypeScript 5.9, Vite 8, browser Canvas/IndexedDB, Node `node:test`, `fake-indexeddb` for storage tests, `happy-dom` for DOM integration tests.

**Spec:** `docs/superpowers/specs/2026-10-02-project-dashboard-cropping-and-test-coverage-design.md`

## Global Constraints

- Cropping is non-destructive; the original screenshot `Blob` must always be preserved.
- Crop/transform metadata affects preview and export only.
- Crop changes must never call Gemini and must never invalidate `analysis`, translations, or English approval.
- Existing projects without crop metadata must continue to load as identity/uncropped projects.
- Preview and export must use the same rendering pipeline and the same stored transform.
- `Apply to all same-size screenshots` is the primary bulk operation and requires identical original pixel dimensions.
- Same-aspect-ratio propagation may be offered only when normalized coordinates remain valid.
- Returning users with at least one project land on a project dashboard; first-time users keep the current onboarding flow.
- Tests run locally with `npm test` / `npm run build`; do not add or run GitHub Actions.
- Preserve the current public repo/Vercel deployment workflow; do not introduce server-side image processing or cloud project sync.

## Review Focus

- **Corrupt/legacy transform data:** loading an older or malformed project must recover to identity transform rather than crash. Pin in Task 2 storage/crop tests.
- **Rotated screenshot bounds:** arbitrary rotation plus zoom/pan must not sample outside the source or produce NaN/negative render rectangles. Pin in Task 4 render-plan tests.
- **Bulk crop mismatch:** same-size propagation must never touch incompatible images; same-aspect propagation must reject invalid mappings. Pin in Task 3 project-state tests.
- **Crop cancellation:** pointer/keyboard edits followed by Cancel must leave persisted project state byte-for-byte equivalent for crop-related fields. Pin in Task 5 crop-editor integration tests.
- **Returning-user boot regression:** one or more saved projects must never reopen the onboarding screen unless the user explicitly presses the new-project FAB. Pin in Task 6 app integration tests.

---

### Task 1: Test Harness and Baseline Module Coverage

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/platform.test.ts`
- Create: `src/archive.test.ts`
- Modify: `src/composition.test.ts`
- Modify: `src/studio.test.ts`

**Interfaces:**
- Consumes: existing `STORE_SIZES`, `createZip`, `getCreativeComposition`, and existing exports from `studio.ts`.
- Produces: a Node test environment capable of DOM and IndexedDB tests in later tasks; baseline invariants for unchanged modules.

- [ ] **Step 1: Add failing platform/archive invariants and missing regression cases**

Add tests asserting:

```ts
// platform.test.ts
assert.equal(new Set(STORE_SIZES.map(s=>s.key)).size, STORE_SIZES.length);
for (const size of STORE_SIZES) {
  assert.ok(Number.isInteger(size.width) && size.width > 0);
  assert.ok(Number.isInteger(size.height) && size.height > 0);
}
assert.equal(STORE_SIZES.find(s=>s.key==='google/feature-graphic')?.kind, 'landscape');

// archive.test.ts
// createZip() returns a Blob whose first four bytes are PK\x03\x04,
// preserves UTF-8 names, accepts binary Blob entries, and writes multiple entries.
```

Extend `composition.test.ts` to cover every `STORE_SIZES` entry and the no-overlap/bottom-margin regression. Extend `studio.test.ts` only where current public exports have uncovered malformed-response/language branches.

- [ ] **Step 2: Run baseline tests and record current failures**

Run: `npm test`

Expected: new tests expose any missing baseline behavior or test-environment gaps; existing tests remain green.

- [ ] **Step 3: Install test-only dependencies**

Run: `npm install --save-dev fake-indexeddb happy-dom`

Keep `node:test` as the runner. Do not add Jest/Vitest or a browser E2E framework.

- [ ] **Step 4: Add only the minimal test setup needed by the new dependencies**

If a shared setup file is needed, create `src/test-env.ts` exporting explicit helpers rather than mutating globals on import. Tests that need DOM/IndexedDB opt in locally.

- [ ] **Step 5: Run the full suite**

Run: `npm test`

Expected: all baseline tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/platform.test.ts src/archive.test.ts src/composition.test.ts src/studio.test.ts src/test-env.ts
git commit -m "test: expand baseline module coverage"
```

---

### Task 2: Crop Data Model, Geometry, and Legacy Storage Compatibility

**Files:**
- Create: `src/crop.ts`
- Create: `src/crop.test.ts`
- Modify: `src/storage.ts`
- Create: `src/storage.test.ts`

**Interfaces:**
- Consumes: `Project` / `ProjectShot` storage model.
- Produces:
  - `CropRect = {x:number;y:number;width:number;height:number}`
  - `ScreenshotTransform = {crop:CropRect;zoom:number;panX:number;panY:number;rotation:number;flipX:boolean;flipY:boolean}`
  - `identityTransform(): ScreenshotTransform`
  - `sanitizeTransform(value: unknown): ScreenshotTransform`
  - `clampCrop(rect: CropRect, minSize?: number): CropRect`
  - `applyAspectRatio(rect: CropRect, ratio: number, anchor?: 'center'|'nw'|'ne'|'sw'|'se'): CropRect`
  - `moveCrop(rect: CropRect, dx: number, dy: number): CropRect`
  - `resizeCrop(rect: CropRect, handle: CropHandle, dx: number, dy: number, ratio?: number): CropRect`
  - `normalizeRotation(degrees: number): number`
  - `sameSourceSize(a: ProjectShot, b: ProjectShot): boolean`
  - `sameSourceAspect(a: ProjectShot, b: ProjectShot, epsilon?: number): boolean`
  - `canApplyTransform(source: ProjectShot, target: ProjectShot, mode: 'same-size'|'same-aspect'): boolean`
  - `ProjectShot.sourceWidth?: number`, `sourceHeight?: number`, `transform?: ScreenshotTransform`
  - `normalizeProject(project: Project): Project`

- [ ] **Step 1: Write failing crop geometry tests**

Cover identity, malformed transform recovery, clamping all four edges, minimum size, ratio presets/custom ratios, moving, resizing each handle, zoom bounds, pan bounds, 90° and arbitrary rotation normalization, flips, reset behavior, coordinate conversions, same-size matching, same-aspect matching, and incompatible propagation.

Representative assertions:

```ts
assert.deepEqual(identityTransform().crop, {x:0,y:0,width:1,height:1});
assert.deepEqual(clampCrop({x:-.2,y:.9,width:.8,height:.5}), {x:0,y:.9,width:.8,height:.1});
assert.equal(normalizeRotation(450), 90);
assert.equal(canApplyTransform({sourceWidth:1179,sourceHeight:2556} as ProjectShot,{sourceWidth:1179,sourceHeight:2556} as ProjectShot,'same-size'), true);
```

- [ ] **Step 2: Run crop tests and verify RED**

Run: `node --test src/crop.test.ts`

Expected: FAIL because `src/crop.ts` and transform types do not exist.

- [ ] **Step 3: Implement the crop types and pure geometry functions**

Add the interfaces and functions above. All persisted coordinates remain normalized to `0..1`. `sanitizeTransform()` must return identity for invalid/NaN/out-of-range persisted values rather than throw.

- [ ] **Step 4: Run crop tests and verify GREEN**

Run: `node --test src/crop.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing storage tests using `fake-indexeddb`**

Cover save/get/list/delete ordering, transform/source-dimension persistence, manifest inclusion, and a legacy project object with no crop fields. Include the Review Focus case: malformed persisted transform normalizes to identity on load.

- [ ] **Step 6: Run storage tests and verify RED**

Run: `node --test src/storage.test.ts`

Expected: FAIL because storage does not yet normalize/persist crop metadata in manifests.

- [ ] **Step 7: Update `storage.ts`**

Extend `ProjectShot`, call `normalizeProject()` at read boundaries (`getProject`, `listProjects`), and include source dimensions + transform in `projectManifest()`. Keep DB version/store unchanged unless a real IndexedDB schema change becomes necessary.

- [ ] **Step 8: Run storage + crop tests**

Run: `node --test src/crop.test.ts src/storage.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/crop.ts src/crop.test.ts src/storage.ts src/storage.test.ts
git commit -m "feat: add non-destructive screenshot crop model"
```

---

### Task 3: Pure Project Mutations and Bulk Crop Propagation

**Files:**
- Create: `src/project-state.ts`
- Create: `src/project-state.test.ts`

**Interfaces:**
- Consumes: `Project`, `ProjectShot`, `ScreenshotTransform`, `canApplyTransform()` from Task 2.
- Produces:
  - `renameProject(project: Project, name: string, now: number): Project`
  - `duplicateProject(project: Project, projectId: string, screenIds: string[], now: number): Project`
  - `setShotTransform(project: Project, shotId: string, transform: ScreenshotTransform, now: number): Project`
  - `applyTransformToMatchingShots(project: Project, sourceShotId: string, transform: ScreenshotTransform, mode: 'same-size'|'same-aspect', now: number): {project:Project;appliedIds:string[];skippedIds:string[]}`
  - `dashboardProjects(projects: Project[]): Project[]`

- [ ] **Step 1: Write failing project-state tests**

Assert rename trimming/length behavior, duplicate IDs/timestamps, duplicate preserving blobs/analysis/translations/transforms without sharing mutable transform objects, set-transform changing only crop-related state, and dashboard sorting by `updatedAt` descending.

Add the Review Focus tests:

```ts
// same-size applies to exactly matching source dimensions
// mismatched dimensions remain unchanged and appear in skippedIds
// same-aspect only applies when normalized transform validates safely
// analysis/translations/englishApproved are deep-equal before vs after crop mutation
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test src/project-state.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `project-state.ts` as immutable pure mutations**

Do not call Gemini, storage, DOM, `Date.now()`, or `crypto.randomUUID()` inside these helpers; callers supply time/IDs so tests remain deterministic.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test src/project-state.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/project-state.ts src/project-state.test.ts
git commit -m "feat: add project state and bulk crop operations"
```

---

### Task 4: Render Plan and Exact Crop-Aware Preview/Export Pipeline

**Files:**
- Create: `src/render-plan.ts`
- Create: `src/render-plan.test.ts`
- Modify: `src/render.ts`
- Create: `src/render.test.ts`
- Modify: `src/composition.ts`
- Modify: `src/composition.test.ts`

**Interfaces:**
- Consumes: `ScreenshotTransform` from Task 2 and `getCreativeComposition()`.
- Produces:
  - `Rect = {x:number;y:number;width:number;height:number}`
  - `RenderMatrix = {a:number;b:number;c:number;d:number;e:number;f:number}`
  - `ScreenshotRenderPlan = {sourceRect:Rect;destinationRect:Rect;matrix:RenderMatrix;rotationBounds:Rect}`
  - `buildScreenshotRenderPlan(sourceWidth:number, sourceHeight:number, transform:ScreenshotTransform, viewport:Rect): ScreenshotRenderPlan`
  - `fitContainedRect(...)` remains a pure helper and is reused by `renderStoreAsset()`.

- [ ] **Step 1: Write failing render-plan tests**

Cover uncropped contain, normalized crop -> source pixels, crop + zoom/pan, horizontal/vertical flip, 90° rotation, arbitrary rotation, all four source corners remaining finite, and all `STORE_SIZES` producing positive finite rectangles.

Add Review Focus case: arbitrary rotation + extreme valid zoom/pan must never yield NaN/Infinity/negative width/height or source sampling outside the decoded image.

- [ ] **Step 2: Run render-plan tests and verify RED**

Run: `node --test src/render-plan.test.ts`

Expected: FAIL because render-plan does not exist.

- [ ] **Step 3: Implement pure render planning**

Compute crop source coordinates from normalized metadata. Build a transform matrix for rotation/flips/zoom/pan around the crop center and calculate the finite transformed bounds used by the canvas adapter.

- [ ] **Step 4: Run render-plan tests and verify GREEN**

Run: `node --test src/render-plan.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing renderer adapter tests**

Use a minimal fake canvas/context only to assert `renderStoreAsset()` consumes the plan and does not fall back to the old full-image path. Keep pixel-sensitive assertions in `render-plan.test.ts`, not canvas snapshots.

Pin regressions:

- identity transform shows the full screenshot,
- a configured crop is the only intentional crop,
- device starts below copy,
- device ends with the required small bottom margin,
- preview and ZIP export call the same `renderStoreAsset()` path.

- [ ] **Step 6: Update `render.ts` to apply transform metadata**

`renderStoreAsset(shot, copy, palette, size, deviceType, mood)` keeps its public signature. Decode the original blob, use `shot.transform ?? identityTransform()`, draw the transformed crop to an offscreen canvas/plan, and contain that result inside the device screen without accidental second cropping.

- [ ] **Step 7: Run renderer/composition tests**

Run: `node --test src/render-plan.test.ts src/render.test.ts src/composition.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/render-plan.ts src/render-plan.test.ts src/render.ts src/render.test.ts src/composition.ts src/composition.test.ts
git commit -m "feat: render stored screenshot crops exactly"
```

---

### Task 5: Crop Editor UI and Interaction Tests

**Files:**
- Create: `src/crop-editor.ts`
- Create: `src/crop-editor.test.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: Task 2 crop geometry and Task 3 bulk project-state operations.
- Produces:
  - `CropEditorOptions = {shot:ProjectShot;shots:ProjectShot[];initial:ScreenshotTransform;onApply:(transform:ScreenshotTransform, bulkMode?:'same-size'|'same-aspect')=>void;onCancel:()=>void}`
  - `mountCropEditor(container: HTMLElement, options: CropEditorOptions): {destroy():void}`

- [ ] **Step 1: Write failing DOM interaction tests in `happy-dom`**

Cover opening the editor, visible crop overlay/handles, free crop drag, each corner/edge resize, preset ratios, custom numeric ratio, zoom slider, wheel zoom, pan, rotate ±90°, fine rotation, flip H/V, fit/fill/center, numeric X/Y/W/H edits, rule-of-thirds/center/safe-area guide toggles, before/after toggle, copy/paste crop settings, undo/redo, keyboard nudging, reset crop, reset all, and bulk controls.

Add Review Focus assertion: perform edits, click Cancel, and verify `onApply` was never called and the original `initial` transform object remains deep-equal.

- [ ] **Step 2: Run crop-editor tests and verify RED**

Run: `node --test src/crop-editor.test.ts`

Expected: FAIL because the editor does not exist.

- [ ] **Step 3: Implement staged editor state**

Keep all edits local until Apply. Maintain an internal bounded undo/redo history of `ScreenshotTransform` snapshots. Pointer/keyboard handlers delegate geometry to `crop.ts`; do not duplicate clamp/ratio logic in UI code.

- [ ] **Step 4: Implement responsive editor styling**

Add crop canvas/overlay, dimmed outside region, resize handles, toolbar, ratio selector, transform controls, guides, bulk-action section, disabled/reason states, and mobile-friendly controls. Preserve the existing studio visual language.

- [ ] **Step 5: Add Apply/bulk behavior tests**

Assert:

```ts
// Apply calls onApply(currentTransform)
// Apply to all same-size calls onApply(currentTransform, 'same-size')
// same-size action disabled when there are no compatible peers
// same-aspect action enabled only when canApplyTransform() permits it
```

- [ ] **Step 6: Run crop-editor tests and verify GREEN**

Run: `node --test src/crop-editor.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/crop-editor.ts src/crop-editor.test.ts src/style.css
git commit -m "feat: add screenshot crop editor"
```

---

### Task 6: Returning-User Dashboard, FAB, and App Orchestration

**Files:**
- Create: `src/dashboard.ts`
- Create: `src/dashboard.test.ts`
- Create: `src/app.ts`
- Create: `src/app.test.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: storage functions, project-state functions, crop editor, current studio/onboarding workflows.
- Produces:
  - `DashboardHandlers = {open:(id:string)=>void;rename:(id:string)=>void;duplicate:(id:string)=>void;delete:(id:string)=>void;export:(id:string)=>void;createNew:()=>void}`
  - `mountDashboard(container:HTMLElement, projects:Project[], handlers:DashboardHandlers): void`
  - `AppDeps` containing storage/Gemini/render/time/ID dependencies needed for deterministic integration tests.
  - `createApp(root:HTMLElement, deps:AppDeps): {boot():Promise<void>;showDashboard():Promise<void>;showNewProject():void}`

- [ ] **Step 1: Write failing dashboard tests**

With `happy-dom`, assert project cards show thumbnail/name/screenshot count/status/last-edited metadata; actions call the correct handler; the `+` FAB is always present; rename/duplicate/delete/export controls remain keyboard accessible.

- [ ] **Step 2: Run dashboard tests and verify RED**

Run: `node --test src/dashboard.test.ts`

Expected: FAIL because dashboard does not exist.

- [ ] **Step 3: Implement `dashboard.ts` and dashboard CSS**

Dashboard takes already-sorted project data and emits no storage/Gemini side effects itself. Use object URLs for thumbnail blobs and revoke them when re-rendered/destroyed.

- [ ] **Step 4: Write failing app integration tests**

Test with injected in-memory dependencies:

```ts
// zero projects -> onboarding/new-project view
// one or more projects -> dashboard immediately
// FAB -> explicit new-project flow
// project open -> studio
// project back -> dashboard when projects exist
// duplicate -> new project without Gemini call
// crop Apply -> transform saved, exact preview refreshed, analysis/translations unchanged
// crop Apply -> Gemini analysis mock call count remains 0
```

Add the Review Focus regression: saved project count `>=1` must never boot into onboarding until FAB is activated.

- [ ] **Step 5: Run app tests and verify RED**

Run: `node --test src/app.test.ts`

Expected: FAIL because current `main.ts` owns all boot/navigation state.

- [ ] **Step 6: Move orchestration from `main.ts` into `app.ts`**

Keep `main.ts` as the thin browser entry point that constructs real dependencies and calls `app.boot()`. Reuse existing onboarding/studio markup and behavior while routing returning users through `mountDashboard()`.

- [ ] **Step 7: Wire crop editor into each screenshot and main preview**

Add a crop/edit action on thumbnail and exact preview. On Apply, call `setShotTransform()` or `applyTransformToMatchingShots()`, persist, regenerate exact preview, and leave Gemini/analysis/translation state untouched.

- [ ] **Step 8: Run dashboard/app tests and verify GREEN**

Run: `node --test src/dashboard.test.ts src/app.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/dashboard.ts src/dashboard.test.ts src/app.ts src/app.test.ts src/main.ts src/style.css
git commit -m "feat: add returning user project dashboard"
```

---

### Task 7: Export/Backup Coverage and Crop Metadata Round Trip

**Files:**
- Modify: `src/archive.test.ts`
- Modify: `src/storage.test.ts`
- Modify: `src/app.test.ts`
- Modify: `src/main.ts` or `src/app.ts` only if tests expose export-path coupling

**Interfaces:**
- Consumes: crop-aware `ProjectShot`, `projectManifest()`, `renderStoreAsset()`, `createZip()`.
- Produces: regression guarantees that ZIP exports and editable backups use the crop-aware pipeline and preserve transform metadata.

- [ ] **Step 1: Add failing export round-trip tests**

Assert project backup JSON contains `sourceWidth`, `sourceHeight`, and normalized `transform`; original screenshot files remain the original blobs; generated store assets are rendered through the transformed shot; no crop operation mutates analysis or translations.

- [ ] **Step 2: Run focused tests and verify RED where behavior is missing**

Run: `node --test src/archive.test.ts src/storage.test.ts src/app.test.ts`

Expected: any missing metadata/export wiring fails explicitly.

- [ ] **Step 3: Make the minimal export-path adjustments**

Do not duplicate crop rendering in export code. Pass the current `ProjectShot` directly into the shared `renderStoreAsset()` pipeline.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test src/archive.test.ts src/storage.test.ts src/app.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/archive.test.ts src/storage.test.ts src/app.test.ts src/main.ts src/app.ts
git commit -m "test: cover crop-aware exports and backups"
```

---

### Task 8: Full Coverage Audit, Regression Sweep, and Build Verification

**Files:**
- Modify: tests only as gaps are found
- Modify: production files only for concrete failures uncovered by the audit
- Modify: `README.md` if user-facing crop/dashboard behavior is currently documented there

**Interfaces:**
- Consumes: all previous tasks.
- Produces: passing full suite/build and documented coverage mapping for every production module.

- [ ] **Step 1: Audit every production TypeScript module against tests**

Create a temporary checklist from the source tree and verify each production module is exercised:

```text
archive.ts       -> archive.test.ts
app.ts           -> app.test.ts
composition.ts   -> composition.test.ts
crop.ts          -> crop.test.ts
crop-editor.ts   -> crop-editor.test.ts
dashboard.ts     -> dashboard.test.ts
platform.ts      -> platform.test.ts
project-state.ts -> project-state.test.ts
render-plan.ts   -> render-plan.test.ts
render.ts        -> render.test.ts
storage.ts       -> storage.test.ts
studio.ts        -> studio.test.ts
main.ts          -> thin entry point covered by app integration + build
```

If additional production `.ts` files exist by then, add them to the audit before proceeding.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: 0 failed tests.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: TypeScript check and Vite build both exit 0.

- [ ] **Step 4: Run explicit regression tests for the originally reported UI issues**

Run focused tests covering:

- exact live preview is generated by the export renderer,
- full screenshot visible for identity transform,
- phone never overlaps headline/subheadline,
- phone ends close to image bottom with small margin,
- returning users see dashboard + FAB,
- cropping never calls Gemini,
- same-size bulk crop copies identical normalized transform,
- legacy projects load without crop metadata.

Expected: PASS.

- [ ] **Step 5: Inspect the final diff for accidental scope expansion**

Confirm there is no GitHub Actions workflow, no destructive image replacement, no re-analysis path, no server-side image dependency, and no cloud sync.

- [ ] **Step 6: Commit final verification/documentation changes**

```bash
git add README.md src
git commit -m "test: complete dashboard and crop regression coverage"
```

- [ ] **Step 7: Final verification before completion claim**

Run fresh, in this order:

```bash
npm test
npm run build
```

Expected: both exit 0 with no failed tests or TypeScript errors. Only after this may implementation be reported complete.
