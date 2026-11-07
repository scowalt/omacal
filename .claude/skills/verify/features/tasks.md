# Tasks

The Tasks pane lists outstanding and done tasks beside the grid. Without an
account, the user creates a list that lives on this machine. They add a task
from the pane's field or from `omacal tasks add`, and tick it off in the
pane. The window updates live when the CLI writes, and the CLI sees what the
window wrote.

## Sub-features

- `tasks-pane`: the pane opens and closes, grouped `By when` or `By list`, ordered by `Date` or `Priority`.
- `tasks-local-list`: `Create a list on this device` makes `Tasks on this device`.
- `tasks-add-ui`: the `New task title` field adds a task on Return.
- `tasks-add-cli`: `tasks add "<title>" [--due D] [--at HH:MM] --json`.
- `tasks-complete`: the `Complete <title>` checkbox ticks a task off. Its label becomes `Reopen <title>`.
- `tasks-cli-read`: `tasks`, `tasks --all` and `tasks lists`, each with `--json`.
- `tasks-demo-chips`: in demo mode, the tasks row above the grid shows tasks with disabled checkboxes.

## How to get to it (user POV)

- Open `Menu` (the ☰ button), then choose `Tasks…`.
- Press `x` with no field focused.
- Run `omacal tasks …` in a terminal.

## Driving it with omacal-verify

Preconditions:

- Local run: `$V launch --local` and then `$V doctor` exit 0.
- Press `$V ax press "Don't start it"` to answer the first-run prompt
  `Start OmaCal when you log in?`.

- **Open the pane.** Run `$V ax press Menu`, then `$V ax press "Tasks…"`.
  `$V ax find Tasks --role AXGroup` finds the pane.
  `$V ax find "No task lists yet." --contains` and
  `$V ax find "Create a list on this device"` both succeed.
  `$V cli tasks lists --json` returns `"data":[]`.
- **Create the list.** Run `$V ax press "Create a list on this device"`.
  `$V cli tasks lists --json` returns `"name":"Tasks on this device"` and
  `"onThisDevice":true`.
- **Add from the CLI.** Run
  `$V cli tasks add "Verify skill probe" --due <today, YYYY-MM-DD> --json`.
  It exits 0 with `"canWrite":true`. Within about 1.5 s,
  `$V ax find "Complete Verify skill probe"` shows the checkbox with
  `value=0`. A task due in the visible week matches twice: the pane's
  checkbox, and the chip on the grid's tasks row. The pane's checkbox comes
  first in the tree, so `press` acts on it. Run `$V snap tasks-added`.
- **Add from the pane.** Run `$V ax fill "New task title" "Typed in the pane" --role AXTextField`,
  then `$V ax key return`. `fill` exits 1 if the text did not land, so stop
  there and do not press Return. `$V cli tasks --json` lists
  `"summary":"Typed in the pane"` with `"due":null`, and
  `$V ax find "Complete Typed in the pane"` succeeds.
- **Complete it.** Run `$V ax press "Complete Verify skill probe"`.
  `$V cli tasks --all --json` shows that task with `"completed":true`, and
  `$V ax find "Reopen Verify skill probe"` shows `value=1` under `DONE TODAY`.
  Run `$V snap tasks-done`.
- **Demo rendering.** In a demo run, press `$V ax key x`. The tasks row
  shows checkboxes such as `Complete Pay the electricity bill`, and the AX
  tree marks them `disabled`.

## Gotchas

- `tasks --json` lists open tasks only. To see completed ones, use
  `tasks --all --json`.
- Run the UI steps one at a time, and check each result before the next
  step. A press that runs straight after a fill can take the focus before
  Return arrives.
- Local mode starts with no lists. Until you create one, `tasks add` has
  nowhere to go.
- The `New task title` field has no AX placeholder. The text "Add a task…"
  that you see is not its name.
- Do not press `In the background` or `With its window` on the first-run
  prompt. Those choices register a login item. `Don't start it` only records
  the answer.
- Local mode shows `Connect Google Calendar` and, when a release is newer,
  an `Update` banner. Never press either: the first starts a real OAuth sign-in
  and the second fetches and installs a release.
- Demo mode refuses every task write. The checkboxes are disabled, and
  `tasks add` exits 6 with `no task list to add to — …`, because no demo
  list is writable. The same message in local mode means you skipped
  creating the list.
