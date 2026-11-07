# Settings

The Settings dialog groups preferences into sections: General, Appearance,
Menu bar, Calendars, Accounts, Notifications and About. A saved value is
stored in the local database, and the app reads it from there.

## Sub-features

- `settings-open`: the dialog opens on `General`.
- `settings-sections`: each section tab shows its panel.
- `settings-save`: a field with its own Save button persists. Examples are
  `Sync every` and `Default meeting duration`.
- `settings-select`: pop-up choices such as `Show dates as` and `Show times as`.

## How to get to it (user POV)

- Open `Menu`, then choose `Settings…`.
- Press Cmd+, (`$V ax key , --cmd`).

## Driving it with omacal-verify

Preconditions:

- Demo run or local run, with `$V doctor` at exit 0. Settings save in demo
  mode too, because they are local preferences and not calendar writes.

- **Open.** Run `$V ax press Menu`, then `$V ax press "Settings…"`. An
  `AXApplicationDialog` named `Settings` has an `AXTabGroup` named
  `Settings sections`, and `General` has `value=1`.
- **Section.** Run `$V ax press Appearance`. `$V ax find Appearance` shows
  `value=1`, and the panel changes. Run `$V ax press General` to go back.
- **Save a value.** Run `$V ax fill default-event-duration 45`, then
  `$V ax press "Save default meeting duration"`.
  `$V ax find default-event-duration` shows `value="45"`. Run
  `$V snap settings-saved`.
- **Persisted.** Run `$V env sqlite3 -readonly "$($V run)/home/Library/Application Support/com.omacal.app/omacal-demo.db" "select * from settings"`.
  Use `omacal.db` in local mode. The output includes
  `default_event_duration_minutes|45`.

## Gotchas

- `Default meeting duration` is also the name of the field's
  `AXStaticText` label. Address the input by its id
  (`default-event-duration`, `sync-interval`) or with `--role AXTextField`.
- Cmd+A does not select in fields, so use `ax fill`. Typing into a filled
  field appends to it: `60` and then `45` gives `6045`, and the app saves
  that value without complaint.
- The `Accounts` section offers real sign-ins. Never add an account to a
  verify instance.
- `Calendars` appears in the menu only when calendars exist, which is demo
  mode. Menu items move between modes, so press them by name.
