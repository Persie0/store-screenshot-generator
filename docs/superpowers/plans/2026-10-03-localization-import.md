# Localization Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each project upload Flutter-generated `app_localizations.dart`, detect supported locales locally, keep English as the fixed source language, and use selected non-English locales for translation tabs and exports.

**Architecture:** Add a pure locale parser/config module, persist optional locale metadata on `Project`, expose explicit locale-target translation while preserving the current default wrapper, and wire project-level language controls into the existing studio. Existing projects remain compatible and use the current six default targets until they import localization metadata.

**Tech Stack:** TypeScript, browser File API, IndexedDB, Node built-in test runner, existing Gemini interaction client, Vite.

**Spec:** `docs/superpowers/specs/2026-10-03-localization-import-and-crop-bulk-design.md`

## Global Constraints

- English (`en`) is always the source/default language.
- Localization-file parsing happens entirely in the browser and never calls Gemini.
- Uploading/replacing the localization file never reruns screenshot analysis.
- All detected non-English locales are selected on first import.
- Unknown but syntactically valid locale codes must be preserved.
- Legacy projects without locale metadata keep the current default translation targets.
- No GitHub Actions are required; use the existing local/Vercel build gate.

## Review Focus

- `Locale('pt', 'BR')` and separator/case normalization must produce `pt-BR` rather than losing the region; pin in Task 1.
- A generated file containing both `supportedLocales` and stale localization imports must trust `supportedLocales`; pin in Task 1.
- Re-import must preserve still-valid unchecked selections while selecting newly discovered locales; pin in Task 2.
- An empty selected-target list must make zero Gemini requests and still leave English usable; pin in Task 3.
- Stale cached translations for deselected locales must not appear in new exports; pin in Task 5.

---

### Task 1: Pure Flutter Locale Parser

**Files:**
- Create: `src/localization.ts`
- Create: `src/localization.test.ts`

**Interfaces:**
- Produces: `extractFlutterLocales(source:string):string[]`
- Produces: `normalizeLocaleCode(code:string):string|undefined`
- Produces: `localeLabel(code:string):string`
- Produces: `DEFAULT_TRANSLATION_LOCALES:readonly string[]` derived from the existing default locale set

- [ ] **Step 1: Write failing parser tests**

Cover these exact assertions:
- `supportedLocales` containing `Locale('en'), Locale('nb'), Locale('nn')` returns `['en','nb','nn']`.
- `Locale('pt','BR')` returns `pt-BR`.
- duplicates are removed in declaration order.
- when `supportedLocales` exists, stale imports are ignored.
- without `supportedLocales`, imports `app_localizations_en.dart` and `app_localizations_nb.dart` return `['en','nb']`.
- malformed/no-locale input throws a readable error.
- an unknown valid code such as `gsw` remains `gsw` and gets label fallback `gsw`.

- [ ] **Step 2: Run `node --test src/localization.test.ts` and verify RED**

Expected: FAIL because `localization.ts`/exports do not exist.

- [ ] **Step 3: Implement the parser and label helpers**

Use a deterministic parser scoped to the generated `supportedLocales` block first, then generated import filenames as fallback. Do not execute/evaluate Dart and do not use Gemini.

- [ ] **Step 4: Run `node --test src/localization.test.ts` and verify GREEN**

- [ ] **Step 5: Commit**

`git commit -am "feat: parse Flutter localization locales"`

### Task 2: Persist Project Locale Configuration

**Files:**
- Modify: `src/storage.ts`
- Modify: `src/storage.test.ts`
- Modify: `src/project-state.ts`
- Modify: `src/project-state.test.ts`
- Modify: `src/localization.ts`
- Modify: `src/localization.test.ts`

**Interfaces:**
- Extend `Project` with `sourceLocale?:string`, `localizedLocales?:string[]`, `translationLocales?:string[]`.
- Produces: `applyImportedLocales(project:Project,detected:string[],now:number):Project`
- Produces: `selectedTranslationLocales(project:Project):string[]`

- [ ] **Step 1: Write failing model/persistence tests**

Assert:
- imported `['en','nb','nn']` stores `sourceLocale:'en'`, `localizedLocales:['en','nb','nn']`, `translationLocales:['nb','nn']`.
- imported `['nb','nn']` still stores English in `localizedLocales` as the fixed source.
- re-import preserves an existing unchecked locale, preserves checked locales that still exist, selects newly detected non-English locales, and removes disappeared locales.
- save/load plus `projectManifest()` preserves all three locale fields.
- `duplicateProject()` deep-copies locale arrays.
- a project with no locale fields resolves to the existing default target set.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test src/localization.test.ts src/storage.test.ts src/project-state.test.ts`

- [ ] **Step 3: Implement optional project fields, normalization, import merge behavior, manifest persistence, and duplicate copying**

Do not bump IndexedDB destructively; optional fields must normalize safely for existing records.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit**

`git commit -am "feat: persist project translation locales"`

### Task 3: Explicit Dynamic Translation Targets

**Files:**
- Modify: `src/studio.ts`
- Modify: `src/studio.test.ts`

**Interfaces:**
- Keep legacy `translateApprovedScreens(apiKey,analysis,fetcher?,onProgress?)` behavior for the current default targets.
- Add `translateApprovedScreensForLocales(apiKey:string,analysis:Analysis,targetLocales:readonly string[],fetcher?:typeof fetch,onProgress?:GeminiProgressCallback):Promise<Translations>`.

- [ ] **Step 1: Write failing translation tests**

Assert:
- targets `['nb','nn']` produce a request schema/prompt containing only `nb` and `nn`.
- `en` passed accidentally is excluded.
- duplicate target codes are deduplicated.
- `[]` returns `{}` and calls the fetcher zero times.
- legacy `translateApprovedScreens()` still requests the existing default locale set.

- [ ] **Step 2: Run `node --test src/studio.test.ts` and verify RED**

- [ ] **Step 3: Implement explicit-target translation and make the legacy function a thin default-target wrapper**

The English source copy in `Analysis.screens` must remain unchanged.

- [ ] **Step 4: Run `node --test src/studio.test.ts` and verify GREEN**

- [ ] **Step 5: Commit**

`git commit -am "feat: translate selected project locales"`

### Task 4: Project Localization Upload and Selection UI

**Files:**
- Modify: `src/app-view.ts`
- Modify: `src/app-view.test.ts`
- Modify: `src/app.ts`
- Modify: `src/app-state.ts`
- Modify: `src/app-state.test.ts`
- Modify: `src/app-features.css`

**Interfaces:**
- Consumes: `extractFlutterLocales`, `applyImportedLocales`, `selectedTranslationLocales`, `localeLabel`, `translateApprovedScreensForLocales`.
- Produces UI controls: file input `#localization-file`, locale checkboxes `[data-translation-locale]`, fixed English source row.

- [ ] **Step 1: Write failing view/state tests**

Assert generated studio markup:
- always displays `English (en)` as source/default.
- for an imported project with `['en','nb','nn']`, renders `nb` and `nn` target checkboxes with the selected state from `translationLocales`.
- exposes an `Upload app_localizations.dart` file input accepting `.dart`.
- uses locale tabs from the project locale configuration rather than all hard-coded defaults once an import exists.

Add state tests proving toggling a target updates only `translationLocales` and `updatedAt`, not analysis/English copy.

- [ ] **Step 2: Run `node --test src/app-view.test.ts src/app-state.test.ts` and verify RED**

- [ ] **Step 3: Implement the project-level language panel and event wiring**

On file change: read with `file.text()`, parse locally, merge locale config, persist, rerender. Surface parser errors in the panel. Do not call Gemini.

- [ ] **Step 4: Update translation action wiring**

`runTranslation()` must call `translateApprovedScreensForLocales(...,selectedTranslationLocales(project),...)`. Locale tab selection must fall back to `en` if the current tab becomes deselected/removed.

- [ ] **Step 5: Run focused tests and verify GREEN**

- [ ] **Step 6: Commit**

`git commit -am "feat: import project languages from Flutter"`

### Task 5: Export Only English + Selected Locales

**Files:**
- Modify: `src/export-plan.ts`
- Modify: `src/export-plan.test.ts`
- Modify: `src/app.ts`
- Modify: `src/app-entry.test.ts`

**Interfaces:**
- Produces: `exportLocales(project:Project):string[]` returning `['en', ...selected targets with generated translations]`.

- [ ] **Step 1: Write failing export tests**

Assert:
- English is always available for export.
- selected `nb`/`nn` with translations are included.
- a deselected locale with stale cached translations is excluded.
- a selected locale without generated translations is not offered as a completed translated export.
- a legacy project continues to expose the current default translated locales that actually exist in `translations`.

- [ ] **Step 2: Run `node --test src/export-plan.test.ts src/app-entry.test.ts` and verify RED**

- [ ] **Step 3: Implement `exportLocales()` and switch export modal/job iteration to it**

Keep `storeAssetJobs(project,locale)` unchanged as the per-locale job builder.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit**

`git commit -am "feat: export selected project locales"`

### Task 6: Localization Full-Suite Verification

**Files:**
- Modify only if failures reveal a localization regression.

**Interfaces:** none new.

- [ ] **Step 1: Run `npm test`**

Expected: all tests PASS.

- [ ] **Step 2: Run `npm run build`**

Expected: test gate, TypeScript, and Vite build all PASS.

- [ ] **Step 3: Manually inspect the generated view contract for the supplied locale set**

Expected: English source plus selected Bokmål (`nb`) and Nynorsk (`nn`) targets; no API call occurs during file parsing.

- [ ] **Step 4: Commit any verification-only fixes if required**

Use a narrowly scoped commit message describing the regression fixed.