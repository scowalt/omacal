# Google OOO All-Day Presentation — Implementation Plan

**Status:** source implementation verified in focused tests; stopped at full
browser acceptance blockers. Not accepted or release-deployed. An explicitly
user-authorized native preview is running; see the manual-preview record below.

**Goal:** Show whole-day Google out-of-office intervals as all-day consistently,
without changing their native timed representation or unrelated behavior.

**Base inspected:** `f078d9d`, on 2026-10-12. Recheck the
current tree before implementation; do not overwrite intervening work.

**Behavior authority:** [the approved spec](../specs/2026-10-12-omacal-ooo-all-day-presentation-design.md).
It owns qualification, recurrence, editing, scope, and cache-reset decisions.
This plan owns implementation order and evidence.

## Execution constraints

- Use synthetic fixtures, in-memory/test databases, or the isolated demo
  profile. Keep the deployed app database, application credentials, and real
  calendars untouched. Tests use mocked Google HTTP, never live accounts.
  The user authorized retaining Portless's development CA after the initial
  tooling incident; make no further Keychain/trust-store changes.
- Work in vertical red → green slices. Write one behavioral test, observe its
  failure, implement enough to pass, then take the next case. An API/type
  mismatch alone is not proof that a behavior regression is covered.
- Follow [the testing standard](../../testing-standard.md): assert deliberate
  mutations on disk with a count/line match; restore from a saved copy, touch
  restored files, then rerun. Record commands, exit codes, and caught tests.
- Match existing style; do not run `rustfmt`. Use runtime `sqlx::query` helpers,
  not compile-time `query!` macros. UI changes use the existing Svelte 5 style.
- A changed CLI contract updates `skills/omacal/SKILL.md` in the same change.
  New visible refusals require the error safelist and its coverage tests.
- On the shared development host, route browser-accessible harness servers
  through Portless with private Tailscale sharing. See the verification setup
  below; keep other projects' servers and the shared proxy untouched.
- If a required tool or defensible implementation path is unavailable, stop
  with the evidence, blocker, and next input needed. Do not replace these gates
  with a live-calendar experiment or claim an unrun suite passed.

## Seams under test

These implement the verification contract approved with the design:

| Interface | What its tests witness |
| --- | --- |
| Google parsing → sync → store read | Source type survives while native flag and instants remain unchanged. |
| Pure timing-presentation module | Whole-day rule, civil dates, timezone choice, and failure defaults. |
| Layout/CLI/detail entry points | Real caller intervals reach the shared module; routing and labels agree. |
| Update entry points → mocked provider | Native serialization, fresh-type safety, and absence of refused mutations. |
| Rust golden payload → UI harness | Tile/popover/editor agreement, capabilities, keyboard/refresh context, pending overlays. |

Use existing `wiremock`, store read interfaces, and generated golden fixtures.
Do not mock the presentation module or hand-compute a separate UI classifier.

## Task 1 — retain provider event type through storage

**Files:**

- `crates/omacal-google/src/model.rs`
- `crates/omacal-sync/src/convert.rs`, `crates/omacal-sync/src/lib.rs`
- `crates/omacal-store/src/events.rs`
- New `crates/omacal-store/migrations/0019_google_event_type.sql`, or the next
  available number if migrations have advanced
- `crates/omacal-sync/src/caldav.rs` and affected synthetic constructors

- [x] Add a wire-parse regression using spec section 1's fixture: capture the
  exact type; also accept absent and unknown type strings without rejecting an
  otherwise valid event.
- [x] Add a sync/store round-trip test at the existing mock-provider seam. Read
  the result through `event_by_id` / `events_in_window`; assert type, false
  native flag, and expected timestamps `1792123200000` → `1792555200000`.
  Exercise an upsert changing the type as well as an initial insert.
- [x] Implement `Event.event_type: Option<String>` mapped from `eventType` and
  `StoredEvent.google_event_type: Option<String>`. Add one nullable SQL column
  with no resync/backfill statements. Update SELECTs, row mapping, bind order,
  INSERT/UPDATE, and write-target reads.
- [x] Carry the field through Google normal/exception/fresh-target conversion;
  keep tombstone suppression unchanged. Other-provider and demo constructors
  default to null unless explicitly building a Google OOO fixture.
- [x] Verify a migrated legacy database retains its events, settings, native
  flags, and sync state, with null metadata. Prove that removing type capture
  or persistence breaks the behavioral round-trip test.

**Complete when:** Google type survives read-back and upsert; legacy rows and
other providers keep their old semantics; the migration performs no refetch.

## Task 2 — one pure presentation module

**Files:**

- New `crates/omacal-core/src/presentation.rs`, exported by its `lib.rs`
- `crates/omacal-core/src/zone.rs` as an existing date-conversion reference
- `crates/omacal-store/src/events.rs` for a thin `StoredEvent` adapter
- `src-tauri/src/write.rs` only as needed to delegate existing span derivation

**Interface shape:** `presentation(source_timing_facts, interval)` returns
`Timed` or `AllDay { start_date, end_date_exclusive }`. Facts include native
all-day status, recognized OOO identity, and event/calendar timezones. Keep the
core independent of the store; a store adapter supplies these facts. Reuse
existing zone utilities, and keep `write::all_day_span_dates`'s callers stable
if its implementation is shared/deepened.

- [x] Start with the verified fixture: projected October 16–21 exclusive while
  native timing is false. Assert literal civil dates, not another helper's
  calculation of expected dates.
- [x] Add cases one at a time: ordinary/default/unknown/null type; misleading
  title; partial-day OOO; single/multiple civil days; zero/reversed intervals;
  unusable timezone; true native all-day controls.
- [x] Add an event in New York on an Auckland calendar and a UTC viewing
  context: event dates, not calendar or viewer dates, determine OOO placement.
  Include a native Auckland all-day control to pin its different zone rule.
- [x] Add New York March 8–9, 2026 (23 hours) and November 1–2, 2026 (25 hours),
  both midnight-to-midnight, plus 23:00/01:00-ending negative controls.
- [x] Implement spec section 2 without elapsed-day division, title heuristics,
  rounding, or a master-level persisted presentation flag. Prove the OOO
  branch, zone choice, and exclusive-end handling independently with mutations.

**Complete when:** one deterministic module produces flags and dates without
modifying timestamps; native all-day behavior remains independently covered.

## Task 3 — route and format read surfaces per interval

**Files:**

- `src-tauri/src/commands.rs`, `src-tauri/src/combined.rs`
- `src-tauri/src/cli.rs`, `src-tauri/src/upcoming.rs`
- `src-tauri/src/notify.rs`, `src-tauri/src/invites.rs`
- `ui/src/lib/api.ts` and downstream feed readers as required

- [x] Write assembler regressions through `assemble_days`, Month, and both
  year assemblers. Assert band/bar membership, exact dates/columns, and no
  duplicate timed copy. Keep ordinary timed and native all-day controls.
- [x] Replace read-routing uses of the stored flag with presentation of the
  current interval. `to_ui` supplies the same flag and dates used by layout;
  combining/overflow must consume that projection rather than rederive it.
- [x] Exercise the actual window-query and occurrence-filter call shape, not
  only a prefilled assembler: an OOO's event-zone date can overlap the shown
  civil day even when its instants do not overlap that viewing-zone day. Supply
  padded OOO candidates as needed and classify before dropping them; keep
  ordinary timed filtering and all recurrence endpoints unchanged.
- [x] Test CLI occurrence rows and ID-only detail through their existing
  interfaces. `allDay` is presentation; existing start/end timestamp fields
  remain real instants. Human all-day output uses projected civil dates.
- [x] Route upcoming/list/search and notification wording through the same
  module where they can contain OOO. Audit all `is_all_day` consumers, recording
  which are presentation and which remain native; include snapshot-backed
  labels if they can contain OOO, retaining needed type/zone facts there.
- [x] Keep `commands::occurrences`, core recurrence, reminder scheduling, export,
  and CLI write-target classification native. Add a CLI timed-update witness
  for an OOO row whose read-facing `allDay` is true.
- [x] Test a recurring master with qualifying and nonqualifying expanded
  intervals, and a moved exception. Mutating back to the master's flag must
  break per-occurrence routing/listing tests.

**Complete when:** all applicable read routes use one classification; no writer
or scheduler consumes a presentation flag as a native timing fact.

## Task 4 — occurrence-aware details and native editor state

**Files:**

- `src-tauri/src/events.rs` (`EventDetail`, detail assembly and return paths)
- `ui/src/lib/eventdetail.ts`, `ui/src/lib/eventform.ts`
- `ui/src/App.svelte`, `ui/src/lib/WeekGrid.svelte`
- `ui/src/lib/EventPopover.svelte`, `ui/src/lib/EventForm.svelte`
- `ui/tests/eventform.spec.ts`, existing UI harness detail stubs

- [x] Add optional occurrence start/end context to detail calls. Require both
  endpoints together and a valid interval. Preserve source/master timestamp
  anchors; project only display classification/dates for the supplied interval.
- [x] Expose `native_is_all_day` separately from read-facing `is_all_day`, and
  an explicit OOO identity/capability for editor restrictions. ID-only details
  retain master-summary behavior; no new CLI command/flag is added.
- [x] Pass context from every opening route, including keyboard navigation,
  combined copies, and popover-local openings. Thread or refetch context after
  refresh, RSVP, and update so a returned master projection cannot replace a
  clicked instance's classification. After a time change, use the updated
  occurrence interval rather than blindly echoing old context.
- [x] Read Rust-projected dates directly for contextual popovers. Remove the
  second JS `occurrenceDate` shift on that path; preserve correct native
  all-day form dates without double-shifting them.
- [x] Seed form timing from the native flag and actual occurrence instants.
  OOO stays timed, retains `sourceStartMs`/`sourceEndMs`, and uses native repeat
  controls. Disable its date-only toggle and following-scope edit choice with
  concise explanations, retaining existing permission gates.
- [x] Keep duplicates ordinary timed creates and reset source-only OOO
  restrictions. Test unchanged form submission, title-only editing, explicit
  time editing, contextual DST popovers, ID-only details, and duplicate drafts.

**Complete when:** clicking/refreshing an instance agrees with its tile, while
form input never mistakes projected all-day presentation for date-only writes.

## Task 5 — enforce provider safety before mutation

**Files:**

- `src-tauri/src/events.rs` (`update_impl`, `update_via_client`, split entry)
- `src-tauri/src/errors.rs`, relevant `cli_write.rs` / IPC tests

- [x] Add mocked-provider tests for date-only OOO and following-scope OOO
  refusals. Cover known cached type, legacy null type discovered by GET, and a
  412 retry that discovers OOO. Assert the absence of every mutating request,
  not merely a returned error or closed dialog.
- [x] Add early cached-type validation and fresh-target/master validation
  before PATCH, split insertion, or truncation. Repeat validation inside the
  conflict-retry path; do not guard only one body-construction call site.
- [x] Add constant safe refusal messages, safelist entries, and visibility
  tests. Backend validation remains authoritative over forged UI/IPC inputs.
- [x] Pin allowed timed edits: a title-only PATCH omits start/end and provider
  type/OOO properties; a time edit sends `dateTime`, never bare `date`. “This
  one” and “All” still work; ordinary-event following edits retain coverage.
- [x] Prove each guard through a separately asserted mutation. Refused splits
  must not truncate the original before failing. Existing native RRULE/UNTIL,
  export, reminders, duplication, authorization, and notify rules stay covered.
  Preserve recurrence-only following deletions; only splitting edits are blocked.

**Complete when:** every applicable write route and retry enforces the same
OOO restrictions, and mock request logs prove refusals have no mutations.

## Task 6 — pending overlays and end-to-end agreement

**Files:**

- `ui/src/lib/pendingedit.ts`, `ui/src/lib/pendingview.ts`, `ui/src/App.svelte`
- `ui/tests/pendingedit.spec.ts`, `ui/tests/pendingview.spec.ts`
- `src-tauri/src/golden.rs`, `ui/tests/generated/`, `ui/tests/fixtures.ts`
- `ui/tests/harness/tauri.ts`, `ui/tests/app.spec.ts`

- [x] Carry the source's OOO fact into the edit request. Reuse the existing
  `when: null` fallback for OOO timing previews; descriptive patches stay
  optimistic and the authoritative reload supplies new timing/presentation.
  Keep ordinary pending edits/creates unchanged. Add no JS whole-day predicate.
- [x] Test that a text edit leaves OOO in its band while saving, a failed edit
  restores the original, and a successful change to partial-day endpoints
  moves it into the timed grid after reload. Native timed instants remain the
  submitted write values throughout.
- [x] Generate a Rust-backed golden carrying the verified event and controls;
  extend harness stubs for new fields and occurrence-aware detail calls.
  Regenerate only affected goldens, not unrelated screenshots.
- [x] Add UI witnesses: band/bar placement → correct popover dates → timed
  editor; disabled native toggle/following option; keyboard opening and refresh
  of a nonqualifying recurring instance; duplicate opens a normal timed draft.
- [x] Exercise a nonmatching event/calendar/browser zone and fixed clocks for
  time-dependent specs. Prove the end-to-end witness fails when the Rust OOO
  rule or occurrence-context propagation is deliberately removed.

**Complete when:** real projected payloads reach the browser and both its
steady-state and pending UI preserve the native/presentation distinction.

## Task 7 — documentation, full gates, and handoff

**Files:**

- `skills/omacal/SKILL.md`
- `docs/running-on-macos.md`, `docs/running-on-omarchy.md`
- These spec/plan files, to record evidence or actual implementation deviations

- [x] Document CLI presentation versus native timing, master versus occurrence
  semantics, and OOO following-edit refusal; preserve existing CLI signatures.
- [x] Document the per-calendar Remove → Add → Sync now rebuild and spec
  section 6's data/history/window caveats. No new reset control, cursor-clearing
  migration, or automatic repair is introduced.
- [x] Run the complete gates below, with fresh output and explicit exit-code
  checks. Record any unavailable tooling or screenshot-policy exclusions.
- [x] Review the final diff against every acceptance item in spec section 7.
  Remove debug instrumentation; report files changed, red/green evidence,
  mutation coverage, gate results, and any blocker without claiming a fix was
  applied to the real user's installed app or cache.

**Complete when:** acceptance and safety evidence is reproducible, project
checks pass, and rollout instructions honestly describe the manual rebuild.

## Verification setup and gates

The inspected host initially lacked Rust on PATH and `ui/node_modules`.
Implementation established an isolated Rust toolchain under
`/tmp/omacal-ooo-impl.3O4fdN` and installed locked UI dependencies and both
Playwright engines. Source that directory's `toolchain.env` before Cargo
commands. The source run guides and `CONTRIBUTING.md` describe prerequisites.

On this shared host, `ui/playwright.config.ts` currently starts a fixed-port
Vite server itself. Before browser tests, run a temporary harness through
Portless with private Tailscale sharing, let it choose the backend port, and
verify/report `portless list`'s local and private endpoints. Use a temporary
Playwright config inheriting the existing projects/test settings but setting
`use.baseURL` to the reported local URL and disabling its automatic
`webServer`. Stop only the temporary server owned by this test run afterward.
If private sharing is unavailable, report the blocker. Do not run the existing
fixed-port harness unmodified or alter another project's server.

Canonical project gates (UI execution must use that harness/config on the
shared host; normal CI keeps its established execution environment):

```bash
cargo test --workspace --no-fail-fast
cargo clippy --workspace --all-targets -- -D warnings
npm --prefix ui run check
npm --prefix ui run test:ui
```

Use the temporary-config equivalent of the final command on the shared host.
Run Chromium and WebKit; handle screenshot exclusions exactly as
`CONTRIBUTING.md` and CI require. A guessed test filter matching zero tests is
not a pass. Follow [the testing standard](../../testing-standard.md) for
mutation restoration and evidence; do not invent fixed test-count thresholds.

## Definition of done

- [ ] Spec section 7's acceptance cases have independent, red-capable witnesses.
- [x] Cached metadata and fresh/retry metadata both enforce mutation safety.
- [x] Source instants/native flags remain intact; all applicable read surfaces
  share the same per-interval classification and event-zone dates.
- [x] CLI, forms, duplicates, overlays, recurrence, reminders, and export are
  tested according to their distinct native/presentation responsibilities.
- [x] All full gates pass by exit code, or implementation stops with an
  explicit unresolved blocker rather than being reported complete.
- [x] Implementation stayed within source/docs/test scope, without modifying
  live calendars or deployed dotfiles/app profiles. The subsequent manual
  preview has separate user authorization recorded below.

## Implementation checkpoint (blocked acceptance)

Provider identity storage, shared per-interval Rust presentation, layout/CLI/
search/feed labels, native reminder wording, occurrence-aware details and
refresh/update responses, timed editor restrictions, deferred OOO overlays,
Rust-backed browser fixtures, and CLI/cache-rebuild documentation are
implemented. The original native timestamps and date-only flag remain intact.
No release deployment has been made. Fork integration is now requested; remote
CI verification is pending. The user-authorized manual preview uses a backed-up
real cache, as recorded below. Do not treat this tree as accepted while its
full browser gate remains unverified.

Verification logs and saved mutation sources are in
`/tmp/omacal-ooo-impl.3O4fdN`. Full workspace checks have passed repeatedly,
including after restoration of nine independent Rust mutations. Eight are
recorded in `mutation-rust-results.json`; `mutation-capture.log` and
`mutation-capture-restored.log` cover type capture. The probes cover capture,
the OOO rule, authored zone, inclusive/exclusive adaptation, cached guard,
fresh target, retry, split boundary, and native export. Restoration uses saved
bytes, a hash comparison, `touch`, and a full-workspace rerun. The retry witness
allows one PATCH rejected by HTTP 412 before OOO discovery, but no retry write.

The restored OOO browser suite passes all 14 tests across Chromium and WebKit
when run serially (`ui-overlay-restored.log`, exit 0). The full focused OOO/
editor/overlay selection also passes all 400 tests (`ui-focused-handoff.log`,
exit 0, one worker). Removing context, native editor seeding, or deferred OOO
timing breaks behavioral assertions, and each restoration passes. Focused
results are not a substitute for the full gate. The UI check has zero errors/
warnings (`ui-check-handoff.log`, exit 0), and the one-time Impeccable detector
returned `[]` and exit 0. Rust tests and clippy pass (`rust-handoff-final.log`
and `clippy-handoff-final.log`, exit 0).

The final broad browser gate exits 1: **2864 passed, 126 failed**
(`ui-full-final.log`, inherited six workers). Not all 126 failures have been
individually classified. Eight observed failures reproduce on
archived base `f078d9d`: ribbon overflow in both engines, Chromium touch swipe,
and WebKit task-row, combined-copy, and shared-hover focus behavior. Serial
reruns of the other three failure cases pass. Separate 60-navigation probes
captured blank pages with HTTP 502 JavaScript/CSS responses through both
Portless endpoints; neither extra exclusions nor assertions were weakened.

Read-path audit: combining consumes Rust's civil spans and keeps each copy's
native endpoints. Popover RSVP adopts only fresh attendees, never an ID-only
master's display fields; its selected interval is not overwritten. Change
notices retain ledger-native snapshot facts: Google status events are primary-
calendar events, their organizer cannot be moved/imported as OOO, and the
ledger excludes the calendar's own events (covered with OOO identity). See
Google's [status-event guide](https://developers.google.com/workspace/calendar/api/guides/calendar-status),
[organizer contract](https://developers.google.com/workspace/calendar/api/v3/reference/events),
and [move restriction](https://developers.google.com/workspace/calendar/api/v3/reference/events/move).
Live invite/decline labels use presentation. Candidate edge behavior is covered
through actual upcoming and ribbon queries; day/month/year queries retain
their existing candidate margin. Native recurrence, reminder anchors, export,
and provider write serialization remain separate from display classification.

The former trust-store pause is resolved: the user chose **Keep CA and
continue**. Retain that CA and the shared proxy. Temporary servers are owned
Portless routes with private sharing; stop only those owned servers after
verification. Remaining acceptance work is a reliable full browser run,
classification of its remaining failures, and any further witnesses that triage
requires. The baseline failures and HTTPS transport issue must be resolved or
verified in an appropriate environment before claiming the full gate passes.
No additional exclusions, trust changes, deployment, or cache rebuild are
implied by this handoff.

### Recorded commands and mutation witnesses

Commands used the isolated toolchain and temporary owned HTTPS harness:

```bash
. /tmp/omacal-ooo-impl.3O4fdN/toolchain.env
cargo test --workspace --no-fail-fast
cargo clippy --workspace --all-targets -- -D warnings
npm --prefix ui run check
./ui/node_modules/.bin/playwright test \
  --config /tmp/omacal-ooo-impl.3O4fdN/playwright.config.ts \
  --ignore-snapshots \
  --grep-invert 'a standalone view gets the same box the app gives it'
./ui/node_modules/.bin/playwright test \
  --config /tmp/omacal-ooo-impl.3O4fdN/playwright.config.ts \
  ooo.spec.ts pendingview.spec.ts pendingedit.spec.ts eventform.spec.ts \
  --workers=1
```

The broad command preserves the existing non-Linux snapshot and standalone-
view exclusions. It inherits six workers and exits 1; the serial focused
command exits 0. No failing behavior assertions were excluded or weakened.

Each Rust probe ran the whole workspace with `--no-fail-fast`: mutation exit
101, saved-byte restoration plus `touch`, and restored exit 0. Each asserted
one on-disk marker with `grep -F -c` / `grep -F -n`. UI probes similarly used
saved files, `touch`, and the restored two-engine OOO suite (14 passed, exit 0).

| Deliberate break | Representative behavioral witness |
| --- | --- |
| Drop Google type capture (`convert.rs:109`) | `out_of_office_sync_keeps_type_and_native_timing_across_upserts`; `mutation-capture.log`. |
| Delete the OOO presentation result (`presentation.rs:68`) | Layout, detail, feed, golden, reminder, and export regressions; `mutation-rust-presentation-rule.log`. |
| Replace authored zone with calendar zone (`presentation.rs:54`) | Foreign-zone OOO dates in layout and detail; `mutation-rust-authored-zone.log`. |
| Stop subtracting the exclusive end (`presentation.rs:22`) | Exact October 16–20 and native all-day controls; `mutation-rust-exclusive-end.log`. |
| Remove cached validation (`events.rs:1735`) | Cached refusal before credentials/permission; `mutation-rust-cached-guard.log`. |
| Remove fresh-target validation (`events.rs:2112`) | Legacy null cache, zero mutating requests; `mutation-rust-fresh-target-guard.log`. |
| Remove retry validation (`events.rs:2165`) | GET → PATCH(412) → GET, no retry mutation; `mutation-rust-retry-guard.log`. |
| Remove split-boundary validation (`events.rs:2308`) | No insertion or truncation request; `mutation-rust-split-guard.log`. |
| Add OOO to date-only export (`export.rs:101`) | Timed `DTSTART`/`DTEND`, no `VALUE=DATE`; `mutation-rust-native-export.log`. |
| Drop detail context (`eventdetail.ts:127`) | Clicked DST interval/IPC endpoint assertions; `mutation-ui-context.log`, exit 1. |
| Seed from display flag (`eventform.ts:969`) | All day checkbox incorrectly checked, timed duplicate lost; `mutation-ui-seed.log`, exit 1. |
| Remove deferred OOO timing (`pendingedit.ts:38`) | Saving/failure chips leave their band; `mutation-ui-overlay.log`, exit 1. |

The extra layout probe re-deleted the shared OOO rule after adding moved-
exception and cross-zone combined-copy cases. Both new witnesses failed
(`mutation-extra-layout.log`, exit 101); the restored workspace passed. OOO
following deletion separately witnesses a recurrence-only native timed UNTIL
and retained identity (`ooo-following-delete.log`, exit 0). No mutation markers
remain in the source tree.

Final source/docs review found no remaining mutation/debug markers.
`git diff --check` passes; 54 changed/new text files have clean whitespace and
final newlines, all 16 local documentation links/anchors resolve, fences are
balanced, and the golden still carries the exact native epochs and inclusive
October 16–20 dates. Temporary current/baseline harness servers are stopped
at handoff; the shared proxy and authorized development CA remain untouched.
The outstanding input is an appropriate reliable full-browser verification
environment, or explicit authorization to expand scope to the baseline UI/
shared-tooling failures. No acceptance exception has been granted.

## User-authorized native preview (2026-10-12)

After requesting that the running app be closed and this build be launched,
the user selected **Existing profile, backed up**, acknowledging that migration
19 may prevent the installed version from reopening without cache rollback.
This approval applies to the manual preview, not to acceptance of the failing
full browser gate or to an automatic calendar rebuild.

- Standalone embedded-asset debug `.app` build: exit 0, local ad-hoc signature
  verified. No development server or additional trust-store changes.
- Installed instance PID `97933` quit normally via `--quit` before backup.
- Private, integrity-checked SQLite backup (migration 18), database settings,
  original login item, checksums and rollback notes:
  `/Users/scowalt/Library/Application Support/OmaCal Backups/ooo-preview-20261012-193930`.
  Directory mode 0700; backup files mode 0600. No account tokens copied.
- Preview bundle: `target/debug/bundle/macos/OmaCal.app`; launched with
  `2026-10-16`. PID `15362` is the sole running OmaCal instance, with an
  onscreen 1280×800 main window. It remains running for the user's trial.
- App startup applied migration 19 to the authorized real profile. Read-only
  verification preserves event 4466's native epochs and `is_all_day = 0`.
- Installed binary checksum and original login item are preserved. The build
  reuses only the installed app's public embedded OAuth application pair;
  neither account tokens nor a credential configuration file were extracted.
- The legacy OOO row still has unknown Google identity at launch. Opening its
  ordinary popover performs the existing provider refresh; reloading the view
  afterward can project the fetched identity. No heuristic backfill, cursor
  reset, direct cache rewrite, or calendar Remove/Add was performed.

Build evidence: `/tmp/omacal-ooo-impl.3O4fdN/native-preview-build.log` (exit 0).
The user subsequently confirmed the live UI as the desired fix and requested
landing it on the fork's `main`. A read-only check with the new binary now
reports `allDay: true`, `nativeAllDay: false`, `googleEventType: outOfOffice`,
inclusive dates `2026-10-16` through `2026-10-20`, and unchanged native epochs
`1792123200000` → `1792555200000`. The live regression is therefore verified
for this cached event after the ordinary provider refetch. This manual result
does not waive the outstanding full browser gate; remote CI verification is
required before merging.
