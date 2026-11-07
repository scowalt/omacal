# Calendar views

The user switches between Day, Week, Month, Year and Big Year, turns on the
List view, pages backward and forward through periods, and returns to today.
The header heading always names the period on screen.

## Sub-features

- `views-switch`: the view switcher selects one of the five views.
- `views-list`: the List view toggle.
- `views-page`: Previous and Next move one period of the current view.
- `views-today`: Today returns to the current period.
- `views-keys`: keys `1`–`5`, `h`/`l`, `t` and `f` do the same things.

## How to get to it (user POV)

- Click `Day`, `Week`, `Month`, `Year` or `Big Year` in the header's view
  switcher.
- Click the `List view` toggle beside the switcher.
- Click `Previous <unit>` or `Next <unit>` (the unit follows the view, for
  example `Next week` or `Next month`), or click `Today`.
- Press `1`–`5` (views), `h`/`l` (previous/next), `t` (today) or `f` (list),
  with no field focused.

## Driving it with omacal-verify

Preconditions:

- Demo run: `$V launch` and then `$V doctor` exit 0.
- No dialog is open. Press `$V ax key escape` if one is.

- **Baseline.** Run `$V snap views-week`. `$V ax find Week` shows
  `value=1`, and the AX tree has an `AXHeading` with the current
  `<Month> <Year>`.
- **Switch by click.** Run `$V ax press Month`. `$V ax find Month` shows
  `value=1` and `$V ax find Week` shows `value=0`.
- **Page.** Run `$V ax press "Next month"`.
  `$V ax find 2026 --contains --role AXHeading` (use the current year) shows
  the next month's name. Run `$V ax press Today`, and the heading is back on
  the current month.
- **Keys.** Run `$V ax key 3`, then `$V ax key l`, then `$V ax key t`. The
  heading changes the same way as with the clicks. Run `$V ax key 1`, and
  `$V ax find Day` shows `value=1`.
- **List.** Run `$V ax key f`, and `$V ax find "List view"` shows `value=1`.
  Press `f` again to turn it off.
- **Proof.** Run `$V snap views-month` after the click switch and
  `$V snap views-list` with List on. The PNGs show the grid. The AX trees
  carry the toggle values and the heading.

## Gotchas

- Every view toggle is an `AXCheckBox/AXToggle`. "Selected" is `value=1`.
  It is not focus: the last toggle you pressed also reads `FOCUSED`.
- In Day view the heading still names the month. Assert the `Day` toggle,
  not the heading.
- Year and Big Year render many cells. A full `ax dump` is large, so prefer
  `ax find`.
- The `DEMO DATA` badge is in the header row in demo mode. It is not a view
  element.
