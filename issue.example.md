# Feature: Use Trip Extras as Calendar Filters

## Goal
Allow selected **list-based Trip Extras** to be used as **filters on the Calendar page (`/calendario`)**, based on the **values assigned to each trip**.

This is an incremental feature. Keep scope tight and avoid breaking changes.

## Context
- Trips (`trippy_trip`) can have **Extras**
- Extras are already in use on a live site and must remain backwards compatible
- Extra definitions, types, and admin behaviour are defined in:
  - `wp-content/plugins/trippy/includes/Admin/TrippyExtras.php`
- Extra types and behaviour are documented in:
  - `wp-content/plugins/trippy/docs/extras.md`
- Extras can be:
  - **List-based** (e.g. Encontro – one or more string values)
  - **Quantity-based** (e.g. number of people, add-ons, etc.)
- Only **list-based Extras** are eligible to be used as filters
- Each trip can have **one or more values per list-based Extra**, stored in post meta
- The Calendar page already lists trips and supports basic filtering
- A cache layer is present, so post meta queries are acceptable

## Source of Truth for Filtering
- **Per-trip Extra values** stored in post meta are the source of truth for filtering
- The way Extras and their values are saved **must not be refactored or changed**
- Global/default Extra values (if present) may be used only to:
  - curate or order filter options
  - hide certain values from the filter UI
- Quantity-based Extras must never appear as filters

## High-level Behaviour
- A **list-based Extra** can be marked as **“usable as a filter”** (boolean flag)
- This flag is defined **globally per Extra**
- Only list-based Extras with this flag enabled appear as filters on the Calendar page
- Filter values are derived from the **unique set of values used by trips**
- Selecting a filter value shows only trips that contain that value for the Extra

## Example
- Extra: **Ponto de Encontro** (list-based)
- Trip values (stored per trip):
  - Trip A: Lisboa
  - Trip B: Porto
  - Trip C: Lisboa, Coimbra
- Extra is marked as **usable as filter**
- Calendar page displays filter options:
  - Lisboa
  - Porto
  - Coimbra
- Selecting “Lisboa” shows **Trip A** and **Trip C**

## Query Strategy (Conceptual)
- It is acceptable to query `postmeta` to:
  - extract unique Extra values and their related trip IDs
  - fetch trip details based on selected filter values
- No changes to the Extras storage schema are allowed
- Planner may propose caching or query optimisations, but must keep behaviour unchanged

## Scope Constraints
- Do **not** refactor how Extras or their values are saved
- Do **not** introduce new tables or migrations
- Do **not** redesign existing Extras admin UI unless strictly required
- Do **not** add advanced filter logic (AND/OR, ranges, etc.)
- Do **not** optimise for performance beyond correctness and existing caching

## Non-goals
- No filtering for quantity-based Extras
- No per-trip UI changes for managing Extras
- No UI for reordering filters
- No multi-select filter logic unless already supported
- No persistence of selected filters between page loads
- No REST API changes unless unavoidable

## Acceptance Criteria
- Only **list-based Extras** can be marked as **usable as filter**
- Quantity-based Extras cannot appear as filters
- Only marked Extras appear as filters on `/calendario`
- Filter values are derived from values actually used by trips
- Selecting a filter value updates the visible trips correctly
- Disabling the flag removes the filter and its UI
- Existing trip data and behaviour remain unchanged

## Notes for Planner (Claude)
- Review `extras.md` before proposing any solution
- Analyse existing Extras and Calendar architecture before proposing changes
- Prefer additive changes over refactors
- Respect the existing Extras storage format and type system
- Keep the solution WordPress-native and consistent with current patterns
- Output **spec + architecture proposal only**, in Markdown
- Do **not** write implementation code, the implementation is a task for CODEX.

## Labels
- `ai-plan`
- `feature`
- `calendar`
