# Localization import and crop bulk design

## Scope

This change extends the existing project editor in three areas:

1. support uploading Flutter-generated `app_localizations.dart` files and deriving the project's translation languages from them;
2. fix the crop editor Apply button contrast regression;
3. add a bulk crop mode that applies the same pixel insets to every compatible screenshot.

The screenshot analysis model remains unchanged: English remains the source/default copy language, and neither localization-file uploads nor crop changes trigger Gemini screenshot re-analysis.

## Goals

- English is always the source/default language.
- A project may import a generated Flutter `app_localizations.dart` file.
- Locale detection is deterministic and local to the browser; it must not use Gemini.
- All detected non-English locales are selected as translation targets by default.
- The user may subsequently enable or disable detected translation targets.
- Locale choices persist with the project and project backup/export metadata.
- Existing projects without locale metadata remain compatible and continue using the existing default translation targets.
- The crop editor Apply action is clearly readable.
- Users can propagate the same physical pixel crop amounts from a source screenshot to other screenshots.

## Locale extraction

### Primary source

Parse the generated Dart declaration:

```dart
static const List<Locale> supportedLocales = <Locale>[
  Locale('en'),
  Locale('nb'),
  Locale('nn'),
];
```

The parser extracts each `Locale(...)` entry inside `supportedLocales`. It supports one-argument language locales and region/script forms such as `Locale('pt', 'BR')` by normalizing them to BCP-47-like codes such as `pt-BR`.

### Fallback source

If no valid `supportedLocales` block can be read, inspect imports matching generated localization files, for example:

```dart
import 'app_localizations_en.dart';
import 'app_localizations_nb.dart';
```

Filename-derived locale codes are a fallback only. `supportedLocales` is authoritative when present.

### Validation and normalization

- Remove duplicates while preserving declaration order.
- Normalize separators to `-`.
- Lowercase language subtags and uppercase two-letter region subtags where applicable.
- Ignore malformed locale expressions instead of guessing their intended language.
- If no locale can be extracted, reject the import with a readable error.
- Preserve valid unknown locale codes even if the UI has no friendly label for them.

## Project locale model

Extend `Project` with optional locale configuration so existing records remain valid:

```ts
sourceLocale?: string;          // normalized to `en` for current product behavior
localizedLocales?: string[];    // all locales detected from the uploaded file
translationLocales?: string[];  // selected non-English translation targets
```

Normalization rules:

- `sourceLocale` is always normalized to `en`.
- `localizedLocales` always includes `en` once locale configuration has been imported; if the uploaded file lacks English, add `en` as the source locale while retaining all detected target locales.
- `translationLocales` must never contain `en`.
- On first import, every detected non-English locale is selected.
- On later edits, the user may unselect any target.
- Importing a replacement localization file updates the detected locale set. Existing selections are preserved for locales that still exist; newly detected non-English locales are selected by default; removed locales are dropped.

For legacy projects without locale metadata, the UI and translation path use the current default target set until a localization file is imported.

## Language UI

Add a project-level **Localization languages** section in the editor.

Controls:

- source language row: `English (en)` shown as fixed/default;
- `Upload app_localizations.dart` file picker;
- detected language list with one checkbox per non-English locale;
- status text showing whether targets came from defaults or an imported localization file;
- replace/re-import action using the same file picker.

Example for the supplied Flutter file:

- English (`en`) — source/default, not translatable;
- Norwegian Bokmål (`nb`) — selected;
- Norwegian Nynorsk (`nn`) — selected.

Friendly labels should use a locale-name map where known, with the locale code itself as the fallback label.

## Translation flow

Refactor translation so locale targets are passed explicitly rather than derived only from a hard-coded global constant.

Conceptually:

```ts
translateApprovedScreens(apiKey, analysis, targetLocales, fetcher, onProgress)
```

Behavior:

- target locale list comes from `project.translationLocales` when present;
- legacy projects fall back to the current default target list;
- English is excluded defensively even if passed accidentally;
- an empty target list produces no translated locales and does not make an unnecessary Gemini request;
- translation JSON schemas/prompts are generated from the selected locale list;
- generated translations are stored only for selected target locales;
- changing locale selection does not rerun screenshot analysis;
- translating again may regenerate selected localized copy but leaves English source copy unchanged.

## Export and backup behavior

Project manifests include the locale configuration fields so restored projects retain their source and selected targets.

Store-asset export includes:

- English source assets;
- each selected translated locale that has generated copy available.

Deselected locales are omitted from new exports even if stale translation data remains in storage. Existing translation data for an unselected locale may remain cached so re-selecting it does not require deleting historical project state.

## Crop Apply button fix

Root cause: the crop-header selector assigns a white background to every header button while the reusable `primary-btn` class sets white text. Selector specificity makes Apply render white-on-white.

Fix the crop-specific primary action so it has an explicit blue background, blue border, and white text, including hover/focus states. Add a style regression test or DOM/style contract test that prevents the header selector from overriding the primary button appearance again.

## Same-pixel bulk crop

Add a third reuse action in the crop editor:

**Apply same pixel crop to all**

This mode is intentionally different from existing normalized same-size/same-aspect propagation.

### Source calculation

From the active screenshot's normalized crop rectangle and source dimensions, derive integer pixel insets:

```text
left   = round(crop.x * sourceWidth)
top    = round(crop.y * sourceHeight)
right  = round((1 - crop.x - crop.width) * sourceWidth)
bottom = round((1 - crop.y - crop.height) * sourceHeight)
```

### Target application

For every other screenshot with known dimensions, create a crop rectangle from those exact insets:

```text
x      = left / targetWidth
y      = top / targetHeight
width  = (targetWidth - left - right) / targetWidth
height = (targetHeight - top - bottom) / targetHeight
```

Skip targets where `left + right >= targetWidth` or `top + bottom >= targetHeight`.

### Transform semantics

This action copies only the crop rectangle derived from the source pixel insets. It does **not** copy:

- rotation;
- flip state;
- zoom;
- pan.

Each target keeps those existing transform fields.

The source screenshot itself remains unchanged except for applying the current crop session normally.

The action should report how many screenshots were updated and how many were skipped because their dimensions were missing or too small.

## Source-dimension handling

Bulk crop controls require source dimensions. Existing screenshot ingestion already records dimensions where available. If a saved screenshot lacks them, obtain its natural image dimensions when opening the crop editor and persist those dimensions before enabling pixel-based propagation.

## Persistence and compatibility

- IndexedDB schema version does not need a destructive migration because the new project fields are optional.
- `normalizeProject()` fills safe defaults without altering legacy project meaning.
- Project manifest version may be incremented if the importer/exporter uses strict version-specific handling; otherwise the current manifest can be extended compatibly with optional fields.
- Duplicate-project logic must deep-copy locale arrays and continue remapping screenshot-linked analysis/translation IDs as it does now.

## Testing

Add tests before production changes.

### Locale parser tests

- parses `en`, `nb`, `nn` from Flutter `supportedLocales`;
- parses language+region locale forms;
- removes duplicates;
- falls back to generated localization import filenames;
- prefers `supportedLocales` over fallback imports;
- rejects files containing no usable locale information;
- preserves unknown valid locale codes.

### Project/storage tests

- English is always source/default;
- all detected non-English locales are initially selected;
- replacement imports preserve still-valid choices and select newly discovered targets;
- project save/load and manifest round-trip locale settings;
- legacy projects retain default-language behavior;
- duplicated projects deep-copy locale configuration.

### Translation tests

- selected target locale list drives the Gemini schema/prompt;
- English is excluded;
- empty target list skips the Gemini request;
- legacy target defaults still work;
- deselected locales are not emitted into new export plans.

### Crop tests

- Apply button markup/style contract remains readable as a primary action;
- exact pixel insets are derived correctly from a normalized crop;
- identical pixel insets map correctly to differently sized screenshots;
- too-small targets are skipped;
- missing dimensions are skipped until dimensions are known;
- pixel propagation preserves each target's rotation/flip/zoom/pan;
- existing same-size and same-aspect modes remain unchanged.

### Final verification

Run the full existing gate:

```sh
npm test
npm run build
```

The Vercel production deployment is considered ready only after the resulting `main` commit reports a successful deployment.

## Non-goals

- No Gemini-based inference of supported app languages.
- No parsing of arbitrary Flutter source trees beyond this generated localization-file format and its generated import fallback.
- No screenshot re-analysis caused by crop or localization changes.
- No automatic translation of the Flutter application's UI strings themselves; this feature only uses the detected locale list to choose App Store screenshot-copy translation targets.
