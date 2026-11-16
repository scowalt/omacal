# Google out-of-office events: all-day presentation

Approved in the design interview on 2026-10-12. This is the behavior contract;
[the implementation plan](../plans/2026-10-12-omacal-ooo-all-day-presentation.md)
describes the work and verification evidence. Implementation is verified by
live user confirmation and the full Linux CI gates; the earlier local browser
blocker and its diagnosis remain recorded in the plan.

## 1. Defect and verified example

Google's actual response for **OOO (🍂)** identifies it as `outOfOffice` and
supplies midnight `dateTime` endpoints, not bare `date` values. The following
fixture replaces the provider id with a synthetic value:

```json
{
  "id": "ooo-display-regression",
  "summary": "OOO (🍂)",
  "status": "confirmed",
  "eventType": "outOfOffice",
  "start": {
    "dateTime": "2026-10-16T00:00:00-04:00",
    "timeZone": "America/New_York"
  },
  "end": {
    "dateTime": "2026-10-21T00:00:00-04:00",
    "timeZone": "America/New_York"
  }
}
```

At inspected base `f078d9d`, `omacal-google::Event` dropped `eventType` during
deserialization. `omacal-sync::convert::to_stored` set `is_all_day` from
`ev.start.date.is_some()`, so this event was stored as timed. Layout and CLI
read that flag directly. The defect was reproduced through both CLI detail and
occurrence listing; it is not just an incorrectly drawn tile.

Google's [status-event guide][google-status] requires timed endpoints for
out-of-office events. Changing the stored flag to true would make existing
edit paths send unsupported bare dates and would also change recurrence,
reminders, and export behavior.

**Required result:** the example appears all-day on **October 16–20, 2026**.
Its exclusive end remains October 21; its native flag remains false; its
stored timestamps and Google's event type and auto-decline properties remain
unchanged merely because it is presented differently.

## 2. Timing facts and presentation

**Native timing** describes what the provider stores. The existing
`StoredEvent.is_all_day` continues to mean native date-only timing. It remains
the authority for recurrence expansion, write serialization, reminder
scheduling, export, and duplication.

**Presentation** describes how one interval is shown. A single pure Rust
module returns either `Timed` or an all-day civil-date span. Callers supply
source timing facts and the interval being presented, not just a series
master. Date conversion and qualification are implemented once, not repeated
in Svelte, CLI formatters, or each view.

The rules are:

1. Native date-only events retain their existing all-day behavior and
   calendar-timezone date semantics.
2. A natively timed event receives special treatment only when its stored
   Google event type is exactly `outOfOffice`.
3. Interpret both endpoints in the event's start timezone. Google conversion
   already resolves an absent event timezone to the calendar timezone. The
   viewing/browser timezone does not determine qualification or span dates.
4. Both endpoints must be exactly local midnight, and the exclusive end date
   must be later than the start date. Qualification is by complete civil days,
   not an elapsed-hours threshold.
5. Missing or unrecognized event types receive no OOO-specific treatment.
   Unusable timezone/interval data falls back to native presentation rather
   than guessing a date. Titles are never evidence of event type.

Use an exclusive end date in the module's span. Adapt once to the existing
inclusive `end_date` payload contract where needed. The viewing timezone still
determines column dates; all-day placement matches the event's civil dates to
those columns. A calendar with a different timezone must not override an OOO
event's own authored dates.

A 23- or 25-hour **midnight-to-midnight** span qualifies. A 9am-to-9am span,
zero-length span, or span ending at 23:00/01:00 does not.

## 3. Recurrence and occurrence context

Apply the rule to each actual expanded interval and materialized exception.
A qualifying master is not permission to mark every occurrence all-day.
Keep existing recurrence expansion and native RRULE/UNTIL handling unchanged;
rounding or stretching occurrence endpoints is outside this fix.

OmaCal currently uses fixed elapsed duration when expanding a series. Around
DST, that can produce an occurrence whose end is not midnight. Such an
occurrence stays timed. Google's public docs do not establish different end
semantics for repeating OOO events; the general [RFC 5545 duration rule][rfc]
is not a reason to introduce a provider-specific recurrence rewrite here.

The detail interface accepts optional occurrence start/end context. Supplying
context computes presentation and date labels for that interval; omitting it
preserves the existing ID-only/master-summary behavior. Every clicked-event
route, including keyboard navigation and detail refresh, must keep this
context. Source/master timestamp anchors used by edits remain distinct from
presentation context.

Thus a tile and its popover agree even when another occurrence of the same
master has a different presentation. CLI occurrence listings classify their
intervals; `events show ID` describes the row/master interval. No new CLI
command or occurrence-selection flag is required.

## 4. Read interfaces and editor

Existing read-facing `is_all_day` / CLI `allDay` fields describe presentation.
Details also expose native timing explicitly so forms never infer a provider
format from a display flag. Keep existing timestamp fields as real instants;
use Rust-derived civil dates for all-day human labels instead of converting
those instants through the browser/system timezone.

The presentation module is shared by Day/Week/range views, Month, both year
views, event details, search/list/agenda paths, upcoming feeds, and any other
read-facing event label that can contain an OOO event. Keep combining, sorting,
overflow, and keyboard selection consistent with the projected classification.
Notification wording may use presentation; firing times remain native.

Window queries and occurrence-overlap filtering must supply qualifying OOO
candidates for their projected civil dates, even at a viewing-zone window edge.
Candidate selection may need padding; ordinary timed routing stays
instant-based, and recurrence endpoints remain unchanged.

**The OOO editor stays timed.** Seed it from actual occurrence timestamps,
retain source instants for unchanged fields, and compute repeat controls from
native timing. Its native date-only “All day” toggle is disabled with an
explanation. Moving into the all-day band gives the event the existing
click-to-edit behavior; this fix adds no all-day dragging or resizing.

Duplication still creates an ordinary timed event. Its create draft must clear
OOO-specific restrictions so it is not mistaken for an edit of the source.

Existing optimistic edit overlays must also distinguish native form timing
from presentation. Reuse their existing deferred-timing path (`when: null`)
for OOO edits until the authoritative reload; descriptive patches may remain
optimistic. This avoids a transient timed-grid copy derived solely from the
timed form and avoids a second classification implementation in JavaScript.

## 5. Write safety

Presentation alone never issues a calendar write or changes native timing.
Edits that intentionally change timestamps continue sending `dateTime`.
Unchanged fields stay absent from PATCH bodies, preserving provider event
metadata and concurrent changes.

Enforce these refusals in both the UI and backend:

- **Date-only OOO input:** reject it; Google does not support that format.
- **“This and following” OOO edit:** reject it before the first mutating
  request. The current split implementation creates an ordinary event for the
  tail and loses OOO/auto-decline semantics. “This one” and “All” edits remain
  available; full OOO-aware splitting is a separate feature. This restriction
  covers series-splitting edits, not existing recurrence-only deletions.

A cached-type preflight gives an early refusal. The fresh target/master and
any conflict-retry target must also be checked before mutation, so missing
metadata in an old cache cannot bypass safety. GET requests for validation are
allowed; refused operations must send no PATCH, POST, DELETE, move, or
truncation write. Existing authorization and notification gates still apply.

New user-facing refusal messages follow `src-tauri/src/errors.rs`'s safelist
rules: constant benign text, explicit allow-list entry, and visibility tests.

## 6. Persistence and cache reset

Add a nullable `google_event_type` source field/column. Preserve unknown type
strings for forward compatibility. Google conversion fills it from
`eventType`; other providers leave it null. Round-trip it through store reads,
upserts, fresh write-target conversion, and applicable exception paths.
Persist facts, not a second all-day flag derived from a master's timestamps.

Existing rows remain null; there is **no automatic backfill, heuristic,
cursor invalidation, or forced resync migration**. A normal provider refetch
can populate the field. Legacy rows remain on native presentation meanwhile.

The supported manual rebuild is **Settings → Calendars → Remove → Add →
Sync now** for the affected calendar:

- It preserves the account, calendar visibility, labels, and color overrides.
- Remove clears local events and that calendar's invite/change history.
- Add enables syncing; Sync now rebuilds the current window, presently 180
  days back through 365 days forward. Older removed events are not restored.
- Sync now alone is normally incremental and is not a cache-clear control.

Document this workflow and its costs. Do not add a new reset UI or clear the
user's calendar cache while implementing or testing this fix.

## 7. Scope and acceptance

Outside scope: special OOO creation, OOO-preserving duplication or series
splitting, automatic repair of cached rows, a general recurrence/DST rewrite,
changes to reminder timing or `.ics` value types, all-day dragging, focus-time
classification, ordinary timed-event reclassification, and CalDAV/WebCal
behavior changes.

The fix is accepted when:

- The fixture in section 1 round-trips with native all-day false and unchanged
  instants, yet every applicable read surface shows October 16–20 all-day.
- Identical ordinary/unknown-type events, including titles containing “OOO”,
  stay timed; partial-day OOO also stays timed.
- Foreign event/calendar/viewing zones and both DST directions are covered.
  Per-occurrence tile, popover, refresh, and CLI classification agree.
- OOO opens in a timed editor. Unchanged/title-only edits do not rewrite
  endpoints; deliberate time edits retain timed provider format.
- Native date-only and OOO series-split attempts cannot issue mutations,
  including with legacy null metadata and after a conflict retry.
- Duplication, reminder scheduling, exports, other providers, and existing
  native all-day behavior retain their documented semantics.
- Tests witness failures against broken behavior, then pass after restoration;
  the full project gates pass by exit code. See [the testing standard][testing].

[google-status]: https://developers.google.com/workspace/calendar/api/guides/calendar-status
[rfc]: https://www.rfc-editor.org/rfc/rfc5545.html#section-3.8.5.3
[testing]: ../../testing-standard.md
