# Crop Apply Visibility and Same-Pixel Bulk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the crop Apply action readable and add a bulk crop mode that applies the source screenshot's exact pixel insets to every compatible screenshot while preserving each target's non-crop transforms.

**Architecture:** Keep crop geometry pure and testable by adding pixel-inset conversion helpers to the crop/project-state layer, then expose one new bulk action in the existing crop editor. The app resolves missing screenshot dimensions before mounting the editor so pixel propagation is available for old projects; the UI fix is a crop-specific primary-button selector so the generic header rule cannot override Apply contrast again.

**Tech Stack:** TypeScript, DOM/CSS, existing crop session/project-state modules, Node built-in test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-10-03-localization-import-and-crop-bulk-design.md`

## Global Constraints

- Crop changes never rerun Gemini analysis.
- Same-pixel bulk applies only crop geometry; rotation, flips, zoom, and pan remain target-specific.
- Pure project-state logic safely skips invalid/missing dimensions, while the browser app must resolve and persist missing source dimensions before enabling pixel propagation.
- Screenshots too small for the source insets are skipped safely.
- Existing same-size and same-aspect bulk modes remain unchanged.
- The crop Apply button must render as blue with readable white text.
- No GitHub Actions are required; use the existing local/Vercel build gate.

## Review Focus

- Rounding source normalized crop to integer pixel insets must not generate negative residual width/height; pin in Task 1.
- Very small target screenshots where opposing insets consume the whole image must be skipped, not clamped into a misleading crop; pin in Task 2.
- Targets with pre-existing rotation/flip/zoom/pan must retain them exactly after pixel bulk application; pin in Task 2.
- Legacy screenshots with missing dimensions must have dimensions loaded/persisted before the crop editor enables pixel propagation; pin in Task 4.
- CSS specificity must keep `.primary-btn` readable inside `.crop-head-actions`; pin with a style contract test in Task 3.

---

### Task 1: Pixel-Inset Crop Geometry

**Files:**
- Modify: `src/crop.ts`
- Modify: `src/crop.test.ts`

**Interfaces:**
- Produces: `type PixelInsets={left:number;top:number;right:number;bottom:number}`
- Produces: `cropToPixelInsets(crop:CropRect,width:number,height:number):PixelInsets|undefined`
- Produces: `pixelInsetsToCrop(insets:PixelInsets,width:number,height:number):CropRect|undefined`

- [ ] **Step 1: Write failing crop geometry tests**

Assert:
- crop `{x:.1,y:.2,width:.7,height:.6}` on `1000×2000` yields `{left:100,top:400,right:200,bottom:400}`.
- converting those same insets onto `2000×3000` yields normalized crop `{x:.05,y:400/3000,width:1700/2000,height:2200/3000}`.
- dimensions `<=0` return `undefined`.
- insets with `left+right>=width` or `top+bottom>=height` return `undefined`.
- floating-point artifacts around the normalized right/bottom edge never produce negative one-pixel results after rounding.

- [ ] **Step 2: Run `node --test src/crop.test.ts` and verify RED**

- [ ] **Step 3: Implement conversion helpers using rounded integer source insets**

Use the exact inset formulas in the approved spec and reject invalid target geometry rather than silently shrinking insets.

- [ ] **Step 4: Run `node --test src/crop.test.ts` and verify GREEN**

- [ ] **Step 5: Commit**

`git commit -am "feat: add same-pixel crop geometry"`

### Task 2: Project-State Same-Pixel Propagation

**Files:**
- Modify: `src/project-state.ts`
- Modify: `src/project-state.test.ts`

**Interfaces:**
- Consumes: `cropToPixelInsets`, `pixelInsetsToCrop`.
- Extend bulk mode with `'same-pixels'` or add `applyPixelInsetsToShots(project:Project,sourceShotId:string,transform:ScreenshotTransform,now:number)` returning `{project,appliedIds,skippedIds}`.

- [ ] **Step 1: Write failing project-state tests**

Use a source shot and differently sized targets. Assert:
- exact source pixel insets are reproduced on each valid target.
- source screenshot gets the current session crop.
- target rotation, `flipX`, `flipY`, `zoom`, `panX`, and `panY` remain byte-for-byte unchanged.
- targets too small for the insets are listed in `skippedIds` and remain unchanged.
- targets with missing source dimensions are skipped by this pure function.
- `analysis`, `translations`, and `englishApproved` are untouched.

- [ ] **Step 2: Run `node --test src/project-state.test.ts` and verify RED**

- [ ] **Step 3: Implement same-pixel project propagation**

Only replace each target transform's `crop` field. Do not reuse the existing full-transform copier for this mode.

- [ ] **Step 4: Run `node --test src/project-state.test.ts` and verify GREEN**

- [ ] **Step 5: Commit**

`git commit -am "feat: apply exact pixel crop across screenshots"`

### Task 3: Crop Editor Action and Apply Contrast Regression

**Files:**
- Modify: `src/crop-editor.ts`
- Modify: `src/crop-editor.test.ts`
- Modify: `src/app-features.css`
- Modify: `src/app-entry.test.ts`

**Interfaces:**
- Extend `CropBulkMode` with `'same-pixels'`.
- Add action button `data-crop-action="apply-same-pixels"` labelled `Apply same pixel crop to all`.

- [ ] **Step 1: Write failing editor/style tests**

Assert:
- crop editor markup contains `Apply same pixel crop to all`.
- action is enabled when the editor receives at least two screenshots with known dimensions and disabled otherwise.
- clicking the action calls `onApply(currentTransform,'same-pixels')`.
- stylesheet contains a crop-header primary rule equivalent to `.crop-head-actions .primary-btn{background:var(--blue);color:#fff;border-color:var(--blue)}` and a readable hover/focus rule.
- generic `.crop-head-actions button` white background remains allowed for Undo/Redo/Cancel without overriding the primary rule.

- [ ] **Step 2: Run `node --test src/crop-editor.test.ts src/app-entry.test.ts` and verify RED**

- [ ] **Step 3: Implement the new crop editor action and explicit primary-action CSS specificity**

The project-state result remains authoritative about applied/skipped IDs.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit**

`git commit -am "fix: expose readable pixel bulk crop action"`

### Task 4: App Wiring, Dimension Loading, and Result Feedback

**Files:**
- Modify: `src/app.ts`
- Modify: `src/app-entry.test.ts`

**Interfaces:**
- Add `ensureProjectDimensions(project:Project):Promise<boolean>` or equivalent browser helper that reads missing image dimensions, mutates only `sourceWidth/sourceHeight`, and reports whether persistence is needed.
- Consumes: same-pixel project-state operation through `mountCropEditor(...onApply...)`.

- [ ] **Step 1: Write failing app-entry contract tests**

Assert source contains wiring that:
- before mounting the crop editor, resolves dimensions for every project screenshot missing `sourceWidth/sourceHeight` using the original Blob;
- persists newly discovered dimensions before presenting the pixel-bulk action;
- when bulk mode is `same-pixels`, uses the pixel propagation path;
- persists the resulting project without altering analysis state;
- surfaces the applied/skipped count to the user after the operation.

- [ ] **Step 2: Run `node --test src/app-entry.test.ts` and verify RED**

- [ ] **Step 3: Implement project-wide dimension loading before crop-editor mount**

Reuse the existing `readDimensions()` logic, resolve only screenshots missing dimensions, persist once if any values were added, then mount the editor with the now-complete screenshot list.

- [ ] **Step 4: Wire the same-pixel result and feedback**

Report `Updated N screenshots; skipped M` when invalid/too-small targets are skipped. Missing dimensions after attempted decoding count as skipped rather than blocking the entire editor.

- [ ] **Step 5: Run focused tests and verify GREEN**

- [ ] **Step 6: Commit**

`git commit -am "feat: wire same-pixel crop bulk action"`

### Task 5: Crop Full-Suite Verification

**Files:**
- Modify only if verification exposes a crop regression.

**Interfaces:** none new.

- [ ] **Step 1: Run `npm test`**

Expected: all tests PASS, including unchanged same-size and same-aspect cases.

- [ ] **Step 2: Run `npm run build`**

Expected: test gate, TypeScript, and Vite build all PASS.

- [ ] **Step 3: Verify the deployed crop dialog contract**

Expected: Apply is visibly blue/white; the new same-pixel action is present; crop changes still do not trigger Gemini analysis.

- [ ] **Step 4: Commit any verification-only fixes if required**

Use a narrowly scoped commit message describing the regression fixed.