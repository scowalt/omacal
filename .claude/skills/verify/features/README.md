# OmaCal verification map

This directory is the maintained source for verifying OmaCal's user-facing
behaviour. Read this index before you drive the app. Then use the matching
feature file as the recipe.

## Baseline preconditions

- Build with `$V build` (`V=.claude/skills/verify/scripts/omacal-verify`).
  The build must carry identifier `com.omacal.verify`.
- Launch with `$V launch` (demo) or `$V launch --local` (local). A recipe
  names the mode it needs.
- Run `$V doctor` and require exit 0 before you drive.
- Drive only the instance this run started. The user's
  `/Applications/OmaCal.app` is also a process called `omacal`. Never touch
  it, its data dir or its sockets.

## Driving conventions

- Start each recipe from a fresh launch unless the recipe says otherwise.
  Demo data is seeded relative to the launch day, so read dates and ids from
  `$V cli events list … --json` instead of hard-coding them.
- Match by accessible name: ARIA label, button text, or DOM id. Never use
  coordinates. Narrow text fields with `--role AXTextField`, or use `fill`
  with the field's id.
- Every UI action is `$V ax …`, and every terminal action is `$V cli …`.
- Bare keys (`/`, `1`–`5`, `h`/`l`, `t`, `x`, `f`, `q`, `n`) are app
  shortcuts only while no text field has focus. Press `escape` first if a
  field has focus.

## Proof and skip reporting

- Run `$V snap <feature>-<step>` before and after each action that changes
  state. A snap writes the AX tree, the log and the window PNG.
- CLI proof is the `evidence/cli-NN.txt` file that `$V cli` writes. It holds
  the command, the output and `[exit N]`.
- Prove a mutation from a second view: a CLI read, an AX find in the window,
  or `sqlite3 -readonly` on the run's database.
- Name the feature ID and the entry point with every artifact you report.
- Report an entry point you could not reach with the command you tried and
  the precondition that was missing. Never report it as verified through a
  different path.

## Feature entry contract

Each feature file has an H1 title and a paragraph that describes what the
user sees. Then come four H2 sections in this order: `Sub-features`,
`How to get to it (user POV)`, `Driving it with omacal-verify` (which starts
with `Preconditions:`) and `Gotchas`.

## Features

- [Calendar views](./calendar-views.md): Day, Week, Month, Year, Big Year and
  List, period paging and Today, from the switcher and from the keyboard.
  Demo mode.
- [Search](./search.md): the search overlay for events and tasks, the empty
  result, opening a hit, and `omacal search`. Demo mode.
- [Event details](./event-details.md): the event popover from the grid and
  from search, and `omacal events list/show`. Demo mode. Event writes are
  out of reach.
- [Tasks](./tasks.md): the Tasks pane, local lists, adding and completing
  tasks from the pane and the CLI. Local mode for writes, demo mode for the
  read-only rendering.
- [Settings](./settings.md): the Settings dialog sections and saving a value
  that persists. Either mode.
