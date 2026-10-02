# Project Dashboard, Screenshot Cropping, and Comprehensive Test Coverage

Date: 2026-10-02

## Goal

Extend Frame so returning users land on a project dashboard, screenshot crops can be edited non-destructively and reused across matching uploads, and every production module has automated test coverage for its meaningful behavior.

The crop system must affect only preview/export. Cropping must never trigger Gemini analysis again, and existing Gemini analysis remains tied to the originally uploaded screenshot.

## User-visible behavior

### Returning-user homepage

- If local storage contains zero projects, keep the existing first-project creation experience.
- If at least one project exists, boot into a project dashboard instead of the upload form.
- The dashboard shows all projects with a visual thumbnail, project name, screenshot count, last edited time, and project status.
- Each project supports open, rename, duplicate, delete, and export where export is available.
- A floating `+` FAB is always visible on the dashboard and opens a new-project flow.
- The new-project flow remains reachable after projects already exist; creating a new project must not replace or hide the dashboard permanently.
- Back navigation from a project returns to the dashboard when projects exist.

### Screenshot crop editor

Cropping is non-destructive. The original blob is preserved and crop/transform metadata is stored on the screenshot.

The crop editor supports, where applicable:

- free rectangular crop
- locked aspect ratio
- original image ratio
- 1:1
- 3:2 / 2:3
- 4:3 / 3:4
- 5:4 / 4:5
- 16:9 / 9:16
- common iPhone portrait ratios
- common Android portrait ratios
- custom numeric ratio
- drag crop box
- edge and corner resize handles
- move crop region
- zoom slider
- mouse-wheel zoom
- pinch zoom where Pointer Events make it practical
- pan
- rotate left/right by 90 degrees
- arbitrary fine rotation / straighten
- horizontal flip
- vertical flip
- fit image
- fill frame
- center crop
- reset crop only
- reset all transforms
- numeric X/Y/width/height fields
- keyboard nudging for crop and selected handles
- rule-of-thirds grid
- center guides
- optional safe-area guides
- before/after toggle
- undo/redo inside the crop session
- copy crop settings
- paste crop settings
- apply to selected screenshots
- apply to all screenshots with identical source dimensions
- apply to all screenshots with identical aspect ratio when the normalized crop remains valid
- explicit warning/disable state when a shared crop cannot be applied safely

The editor must clearly show when a crop is inherited/copied versus locally edited.

### Same-size bulk crop

If screenshots share identical original pixel dimensions, the editor exposes `Apply to all same-size screenshots`.

Crop values are normalized to the original source dimensions, so the same visible source region is applied to every same-size screenshot. Rotation, flips, and zoom/pan are included in the copied transform.

A separate same-aspect-ratio action may be offered when the crop can be mapped safely by normalized coordinates, but the exact same-size action remains the primary, guaranteed-safe bulk option.

### Gemini behavior

- Initial analysis continues to use the original upload.
- Crop edits never call Gemini.
- Crop edits never invalidate `analysis`, translations, or English approval.
- There is no automatic or manual crop-triggered reanalysis action in this feature.
- Analysis-derived overlap warnings continue to refer to the original screenshot and should not claim to represent the cropped image.

## Data model

Extend `ProjectShot` with optional transform metadata.

Suggested model:

```ts
export type CropRect = {
  x: number;      // normalized 0..1
  y: number;      // normalized 0..1
  width: number;  // normalized 0..1
  height: number; // normalized 0..1
};

export type ScreenshotTransform = {
  crop: CropRect;
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
};

export type ProjectShot = {
  id: string;
  name: string;
  blob: Blob;
  headline: string;
  subheadline: string;
  edited?: boolean;
  sourceWidth?: number;
  sourceHeight?: number;
  transform?: ScreenshotTransform;
};
```

`sourceWidth` and `sourceHeight` are persisted once known so matching screenshots can be detected without repeatedly decoding blobs.

Existing projects without transform metadata are treated as uncropped with an identity transform. No IndexedDB schema migration is needed if projects remain structured-clone values in the existing object store, but compatibility tests must verify older project objects load correctly.

`projectManifest()` should include transform metadata and source dimensions in editable backups.

## Crop geometry module

Create a dedicated pure module, e.g. `src/crop.ts`, responsible for:

- identity transform creation
- crop normalization and clamping
- aspect-ratio locking
- resize calculations
- pan/zoom bounds
- rotation normalization
- flip transforms
- fit/fill calculations
- source-to-preview coordinate conversion
- preview-to-source coordinate conversion
- same-size and same-aspect matching
- safe crop propagation
- copy/paste transform validation
- crop equality checks

The UI should not duplicate geometry rules. Pointer handlers call these pure functions, making the behavior deterministic and testable.

## Rendering pipeline

`renderStoreAsset()` remains the single source of truth for both exact preview and export.

Pipeline:

1. decode original blob
2. apply stored transform to the original image
3. produce the transformed screenshot region
4. contain that transformed region inside the device screen area without additional accidental cropping
5. render device frame and store background/copy
6. return PNG

Preview and export must call the same renderer with the same `ProjectShot.transform`.

Rendering math that can be pure should move into testable helpers, e.g. `src/render-plan.ts`, leaving canvas drawing as a thin adapter. The plan should describe source rectangle, transform matrix, device rectangle, and image destination rectangle so tests can verify geometry without pixel-fragile canvas snapshots.

## Crop editor UI structure

Create a dedicated crop editor component/module instead of adding another large block to `main.ts`.

Suggested separation:

- `crop.ts` — pure crop geometry and transform logic
- `crop-editor.ts` — crop modal/view state and pointer/keyboard interactions
- `render-plan.ts` — pure render calculations
- `render.ts` — canvas adapter
- `dashboard.ts` — returning-user project dashboard rendering and actions
- `project-state.ts` — pure project mutations such as duplicate/rename/crop propagation
- `main.ts` — boot/orchestration only

The crop editor can open from each screenshot thumbnail and from the main preview. It should render the actual screenshot with an overlay and handles, not a second destructive bitmap.

Edits are staged inside the editor and committed on Apply. Cancel restores the previous transform. Undo/redo is local to the current crop session and does not require a global project history system.

## Dashboard architecture

Boot flow:

```text
boot
  -> listProjects()
  -> no projects: first-project onboarding
  -> projects exist: dashboard
```

The dashboard is derived from saved `Project[]` and should not depend on Gemini state beyond the existing project status fields.

Project duplication copies metadata and blobs using structured clone semantics, assigns a new project ID and timestamps, and preserves screenshot transforms. Duplicating must not call Gemini.

## Error handling

- Invalid transform metadata falls back to identity instead of breaking project load.
- Crop coordinates are clamped to valid normalized bounds.
- Zero/negative crop dimensions are rejected.
- Bulk crop is disabled for incompatible images and explains why.
- If source dimensions cannot be decoded, the crop editor shows a recoverable error and leaves the original project unchanged.
- Canvas/render failures keep the previous saved transform and surface an error message.
- Canceling crop editing never mutates stored state.

## Testing strategy

The request is to add tests across all code parts. The implementation should therefore ensure every production TypeScript module has a corresponding test file or is covered through an integration test when direct unit testing is not meaningful.

### Existing modules

#### `composition.ts`

Test:

- every `STORE_SIZES` entry
- portrait and landscape
- one/two headline lines
- one/two subheadline lines
- copy/device non-overlap
- bottom margin
- screenshot aspect-ratio preservation
- phone/tablet geometry bounds

#### `studio.ts`

Keep and extend current coverage for:

- upload validation
- Gemini response parsing
- model fallback/retry decisions
- analysis normalization
- translation parsing
- overlap scanning
- malformed API responses
- language handling

#### `storage.ts`

Add tests for:

- save/load/list/delete
- updated ordering
- transform persistence
- source dimension persistence
- legacy projects without crop fields
- manifest output
- safe names
- duplicate project data compatibility

Use an IndexedDB test implementation such as `fake-indexeddb` in Node tests rather than depending on a real browser profile.

#### `archive.ts`

Add tests for:

- ZIP signature/structure
- UTF-8 filenames
- binary blobs
- multiple entries
- empty files
- duplicate/unsafe path handling if relevant
- generated export file paths

#### `platform.ts`

Add invariant tests for:

- unique keys
- positive integer dimensions
- supported kinds/platforms
- expected feature-graphic landscape shape
- expected phone/tablet portrait shapes

#### `render.ts`

Keep canvas code thin and test via render-plan helpers plus a small adapter smoke test where the environment permits.

Test:

- transformed screenshot is contained, not accidentally cropped again
- source crop maps correctly
- rotation/flip matrices
- device bottom spacing
- copy does not overlap device
- preview and export use the same plan
- all store sizes produce valid geometry

#### `main.ts`

Refactor logic out until `main.ts` is mostly wiring. Add a smoke-level DOM integration test for:

- boot with zero projects
- boot with projects
- navigation dashboard -> project -> dashboard
- FAB opens new project flow
- crop button opens editor
- export action is still reachable

### New crop tests

`crop.test.ts` should cover at minimum:

- identity transform
- normalization
- crop clamping on all four sides
- minimum crop dimensions
- all preset ratios
- custom ratios
- ratio lock during edge/corner resize
- move crop
- zoom bounds
- pan bounds
- fit
- fill
- center
- 90-degree rotation
- arbitrary rotation normalization
- horizontal flip
- vertical flip
- reset crop
- reset all
- normalized/source coordinate conversion
- copy/paste transform
- same-size propagation
- same-aspect propagation
- incompatible propagation rejection
- source bounds after rotate/flip
- crop equality
- malformed persisted transform recovery

### Dashboard tests

`dashboard.test.ts` / `project-state.test.ts` should cover:

- zero-project state
- populated state
- project sorting
- open project
- rename
- duplicate
- delete
- status display mapping
- FAB action
- duplicate preserves transforms but changes IDs/timestamps

### Crop-editor integration tests

Use a DOM test environment such as `happy-dom` or `jsdom` for interaction logic. Cover:

- opening an image
- dragging crop region
- resizing crop handles
- ratio change
- zoom/pan controls
- rotate/flip
- undo/redo
- numeric coordinate edits
- Apply persists
- Cancel discards
- Apply-to-all matching screenshots
- bulk action disabled for incompatible screenshots
- no crop action invokes Gemini
- analysis/translations remain unchanged after crop

### Regression tests

Preserve explicit regressions for already fixed issues:

- exact preview uses export renderer
- full screenshot remains visible when no crop is configured
- phone does not overlap text
- phone reaches close to the bottom with only a small margin
- project homepage appears for returning users

## Test tooling

Continue using the public repository only. Do not use GitHub Actions for this work.

Recommended lightweight additions:

- keep Node's built-in `node:test`
- `fake-indexeddb` for IndexedDB tests
- `happy-dom` for DOM interaction tests

Avoid introducing a large end-to-end framework unless unit/integration coverage proves insufficient. Browser-only rendering should be reduced to pure render-plan math so most behavior remains deterministic in Node.

## Acceptance criteria

1. Existing users with projects land on a dashboard with all projects and a `+` FAB.
2. First-time users with no projects retain the onboarding/new-project screen.
3. Any screenshot can be cropped non-destructively.
4. The original screenshot blob is preserved.
5. Crop editor exposes the listed crop/transform options where technically meaningful.
6. Same-size screenshots can receive the exact same crop/transform in one action.
7. Crop edits affect exact preview and ZIP export identically.
8. Crop edits never call Gemini and never invalidate analysis/translations.
9. Existing projects without crop metadata continue to load.
10. Every production module has meaningful automated test coverage, with pure logic extracted from `main.ts` where necessary.
11. Tests are run locally; no GitHub Actions are used.
12. Build and full test suite pass before completion is reported.

## Out of scope

- re-running Gemini because of crop changes
- destructive replacement of the original screenshot
- cloud project sync
- collaborative/multi-user editing
- server-side image processing
- global multi-step undo across the entire project
