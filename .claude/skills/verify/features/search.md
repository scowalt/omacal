# Search

The user searches event and task titles from an overlay. Each hit is a
button that carries the title and date, and choosing an event hit lands on
its day and opens its popover. A query with no hits says so. The CLI's
`omacal search` answers the same question from the database.

## Sub-features

- `search-open`: the overlay opens with focus in its field.
- `search-hits`: event and task hits, each labelled with the title and the date.
- `search-empty`: a query that matches nothing says `Nothing matches “<q>”.`
- `search-open-hit`: choosing an event hit opens that event's popover.
- `search-cli`: `omacal search <words> --json` returns `events` and `tasks`.

## How to get to it (user POV)

- Click `Search` (the magnifier) in the header.
- Press `/` with no field focused.
- Run `omacal search <words>` in a terminal.

## Driving it with omacal-verify

Preconditions:

- Demo run: `$V launch` and then `$V doctor` exit 0. The demo seeds
  `Standup` (recurring), `Ops review` and the task
  `Pay the electricity bill`.

- **Open by click.** Run `$V ax press Search`.
  `$V ax find "Search events and tasks" --role AXTextField` shows `FOCUSED`.
- **Event hit.** Run `$V ax type "Ops review"` and wait about 1 s.
  `$V ax find "Ops review" --contains --role AXButton` shows one button
  titled `Ops review <Day>, <Mon> <d>, <yyyy>`. Run `$V snap search-hit`.
- **Open the hit.** Run `$V ax press "Ops review" --contains --role AXButton`.
  An `AXApplicationDialog` titled `Ops review` appears. Close it with
  `$V ax key escape`.
- **Open by key.** Run `$V ax key /`, `$V ax type electricity`. One hit
  appears: `Pay the electricity bill <date> · Home`.
- **Empty.** Run `$V ax fill "Search events and tasks" zzqx --role AXTextField`.
  `$V ax find "Nothing matches" --contains` succeeds. Run
  `$V snap search-empty`.
- **CLI.** Run `$V cli search ops review --json`. It exits 0, and `data.events`
  holds an entry with `"title":"Ops review"`. Run
  `$V cli search electricity --json`, and `data.tasks` holds the task.

## Gotchas

- Return in the search field does nothing; that is by design. The hits are
  buttons, so press one, or `tab` to it and press `return`.
- A hit's accessible name joins the title and the date. Match it with
  `--contains`.
- For a recurring event, the CLI returns the nearest occurrence only, not
  one per day.
- `$V ax press Search` matches the header button. The overlay's dialog is
  also named `Search`, so once the overlay is open, address its field by
  `Search events and tasks`.
