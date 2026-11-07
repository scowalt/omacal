# Event details

Clicking an event on the grid opens a popover with the event's title, time
and location, and the actions the calendar allows. In demo mode those are
`Duplicate` and `Export`. `omacal events list` and `omacal events show`
print the same event from the terminal.

## Sub-features

- `detail-grid`: an event block opens its popover.
- `detail-search`: a search hit opens the same popover (see [Search](./search.md)).
- `detail-copy`: the title, the date and time, and the location are copy buttons.
- `detail-cli-list`: `events list --from D --to D --json` gives occurrences with `eventId`.
- `detail-cli-show`: `events show ID --json` gives the whole event, guests included.

## How to get to it (user POV)

- Click an event block in the Day, Week or Month grid.
- Choose an event hit in the search overlay.
- Run `omacal events list --from D --to D` and then `omacal events show ID`.

## Driving it with omacal-verify

Preconditions:

- Demo run: `$V launch` and then `$V doctor` exit 0. The Week view is
  showing the current week.

- **Find a block.** Every event block is an `AXButton` named
  `<title>, HH:MM to HH:MM, <location>, <calendar>`. Run
  `$V ax find "Ops review, " --contains`.
- **Open it.** Run `$V ax press "Ops review, " --contains`. An
  `AXApplicationDialog` named `Ops review` appears, with an `AXHeading`, the
  buttons `Copy title`, `Copy date and time` and `Copy location`, and the
  buttons `Duplicate` and `Export`. Run `$V snap detail-popover`.
- **Close it.** Run `$V ax key escape`. The dialog is gone.
- **CLI list.** Run `$V cli events list --from <that day> --to <that day> --json`,
  with the date from the popover. It exits 0, and an entry has
  `"title":"Ops review"`, its `eventId`, `"calendar":"Work"` and
  `"location":"Meet"`.
- **CLI show.** Run `$V cli events show <eventId> --json`. It exits 0, with
  the same title, time and location as the popover.

## Gotchas

- Demo mode is read-only. The popover offers no Edit, Delete or RSVP, and
  `$V cli events create … --calendar 1 --notify none --json` exits 6 with
  `demo mode — there is nothing to create`. That proves the socket and the
  guard, not a write.
- Local mode has no event calendars at all. Creating, editing, deleting and
  answering events need a Google or CalDAV account, and this harness never
  connects one. Report event writes as unverified.
- Demo events are seeded relative to the launch day. Read the date from the
  block or from `events list`. Never hard-code it.
- The same title repeats across days (`Standup`), so a `--contains` match
  takes the first block in tree order. Add the time to the label to pick one.
