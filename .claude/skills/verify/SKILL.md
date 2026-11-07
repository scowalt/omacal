---
name: verify
description: Launch an isolated OmaCal desktop app (Tauri, macOS) in demo or local mode, drive its real window through the Accessibility API and its CLI through the app's socket, and capture AX trees, window screenshots, CLI output and database state as proof. Use to verify any user-facing change to OmaCal's UI, CLI or app behaviour before calling it done.
---

# Verify OmaCal

OmaCal is one binary with two surfaces: a Tauri window (Svelte UI in a
WKWebView) and a CLI (`omacal agenda`, `events`, `tasks`, …) whose reads open
the local SQLite database and whose writes travel a Unix socket into the
running app. This skill drives **both against a real build**, never against
the user's own calendar.

Everything goes through one helper. Call it by path from anywhere in the
repo:

```bash
V=.claude/skills/verify/scripts/omacal-verify   # fish: set V .claude/skills/verify/scripts/omacal-verify
```

Platform: **macOS only.** It needs Xcode's `swiftc`, and the calling process
needs Accessibility permission. Window PNGs need Screen Recording permission;
without it, `snap` still writes the AX tree and log. On Linux, the window is
WebKitGTK and this harness does not apply. Use the Playwright harness in
`ui/tests` for component-level checks there, and say that the real window
was not driven.

## Why it is shaped like this

The user may have the installed OmaCal running, with real accounts. A
default dev build is dangerous next to it, for three reasons:

- **Single instance.** `tauri-plugin-single-instance` uses
  `/tmp/com_omacal_app_si.sock`. A second `com.omacal.app` process gives its
  argv to the real app and exits.
- **Shared home.** The data dir (`~/Library/Application Support/com.omacal.app`),
  the CLI socket, the agent-skill auto-install (`~/.agents/skills/omacal`) and
  the Keychain all hang off `$HOME`.
- **Socket path length.** The CLI socket sits beside the data dir, and a
  worktree-deep path is longer than `SUN_LEN`. Then
  `could not bind the CLI socket` appears in the log and CLI writes are off.

So the verify build has the identifier `com.omacal.verify`. Every run gets a
scratch `HOME` under `target/verify/runs/<id>/home` and a short
`XDG_RUNTIME_DIR` (`/tmp/omv.XXXXXX`), which `ipc::socket_path` uses on
macOS too. With a scratch `HOME`, macOS finds no default keychain, so the
instance cannot read the user's tokens. `omacal doctor` reports this as
`✗ keyring`. That is expected.

## Build (once, and after every code change)

```bash
$V build
```

This runs `tauri build --debug --no-bundle --config '{"identifier":"com.omacal.verify"}'`
from the repo root and writes `target/debug/omacal`. It also compiles the AX
driver to `target/verify/bin/ax`. A first build takes about 1 minute on an M3
when Rust is installed through rustup into `~/.cargo`. The helper puts
`~/.cargo/bin` on `PATH`.

`cargo tauri dev`, `cargo build` and `tauri build` without the `--config`
override all write a `com.omacal.app` binary to the same path. `launch`
refuses that binary. Run `$V build` again.

## Launch

```bash
$V launch            # demo mode: OMACAL_SEED_DEMO=1, ~44 synthetic events, no network, read-only
$V launch --local    # local mode: empty database, no accounts, writable local task lists
```

The app is ready when `launch` prints `run:` and `mode:`. Before it returns,
it waits for the log line `CLI write socket up`, then for the header's
`Quick add event` button in the AX tree. The first AX query also wakes
WebKit's accessibility tree. Each launch starts from an empty data dir, and
demo seeding runs on every launch.

Which mode:

- **Demo** for anything that renders, navigates, searches or opens events.
  Every calendar write is refused. Task checkboxes are disabled.
  `events create` exits 6 with `demo mode — there is nothing to create`,
  and `tasks add` exits 6 with `no task list to add to — …`. Settings still
  save.
- **Local** for writes that do not need an account: local task lists, tasks
  and settings. It makes real network calls (the GitHub update check, and
  Open-Meteo weather).

Event create/edit/delete/RSVP needs a Google or CalDAV account. **This
harness cannot verify those writes.** Report them as unverified. Never
connect the user's accounts to a verify instance.

The window opens on the user's screen and takes focus. Keystrokes go to the
app's pid (`CGEventPostToPid`), so they do not leak into other apps. Only one
verify instance can run at a time, because they share
`/tmp/com_omacal_verify_si.sock`.

## Doctor

Run this first whenever anything looks off. It only reads, and it never
connects to the single-instance socket, because a connection to that socket
is a message to the app.

```bash
$V doctor
```

It checks these things: the process is alive and is this repo's
`target/debug/omacal`; the binary carries `com.omacal.verify`; that pid holds
both sockets; Accessibility is trusted and the UI is mounted; demo runs show
the `DEMO DATA` badge; and the CLI reads this run's database. Exit 0 means
the instance is worth driving.

## Drive

**UI**: `$V ax <verb> …`. It fills in the run's pid. Elements are matched by
their accessible name: ARIA `aria-label` → AXDescription, button text →
AXTitle, field contents → AXValue, and the DOM `id` → AXDOMIdentifier. A
match is exact unless `--contains` is given.

```bash
$V ax dump                          # whole window, one element per line (role desc= title= value= id= @x,y wxh)
$V ax find "Search" [--contains] [--role AXButton]   # exit 1 if absent
$V ax wait "Standup" --contains --timeout 10
$V ax press "Next week"             # AXPress: buttons, toggles, checkboxes, event blocks
$V ax focus "New task title" --role AXTextField
$V ax type "text"                   # into whatever has focus
$V ax fill default-event-duration 45    # focus + select all + delete + type; exit 1 unless the field then reads 45
$V ax key escape | return | tab | / | 3 | x  [--cmd --shift --alt --ctrl]
```

Use `--role AXTextField` (or `fill` with the field's DOM id) for text
fields. A field's visible label is often an `AXStaticText` with the same
name, earlier in the tree, and a bare `focus` lands on the label. Cmd+A does
nothing because the app has no Edit menu, so `fill` selects the text through
AX. Toggles show `value=1` when they are on, for example the view switcher's
`Week`. The handles that are worth knowing are in the feature files.

**CLI**: `$V cli <omacal args>` runs the build with the run's `HOME` and
runtime dir. It returns the CLI's exit code. Each call, reads included, is
saved to the next `evidence/cli-NN.txt`, with the command and `[exit N]`.
`$V doctor` is not saved. Use `--json` for
assertions. Exit codes: 0 ok · 2 usage · 3 no database · 4 error ·
5 app not running · 6 the app refused the write.

**Anything else in the run's environment**: `$V env <cmd>`. `$V run` prints
the run dir. The database is
`$($V run)/home/Library/Application Support/com.omacal.app/omacal-demo.db`
(demo) or `…/omacal.db` (local). Read it with `sqlite3 -readonly` as the
second view of a write. For example, settings land in table `settings`, as
`key|value` rows.

## Evidence

```bash
$V snap <name>     # evidence/<name>.ax.txt (AX tree), <name>.log (app log so far), <name>.png (window)
```

`snap` prints the path of each file it wrote, one per line.

All proof lives in `target/verify/runs/<id>/evidence/`. Cleanup keeps it
there. A proof follows these rules:

- Drive the user's path: a button through `ax press`, a field through
  `ax fill`, a key through `ax key`, and the CLI verb itself. Never call
  Tauri commands, write to the database directly, or edit settings rows to
  set up the state you then "verify".
- Snap before and after the action, not only the final screen.
- Check the side effect from a second view. A UI write gets a CLI read or a
  `sqlite3 -readonly` read. A CLI write gets an AX find, which also proves the
  window refreshed live.
- When the CLI exits 6, look at the message. Under demo mode, a 6 proves the
  socket and the guard and nothing more.
- Report each mapped entry point you drove. If you skipped one, report it as
  skipped, with the unmet precondition.

## Cleanup

```bash
$V cleanup
```

Cleanup sends `omacal --quit` to the run's instance over its own
single-instance socket. That is a clean exit, and the app removes the socket.
If the process is still alive after 5 seconds, cleanup signals the recorded
pid, and only if that pid is still this repo's binary. It then deletes the
run's `home/` and `/tmp/omv.*` runtime dir and drops `target/verify/current`.
It prints the evidence path it kept. It never kills anything by name. The
user's `/Applications/OmaCal.app` process is also called `omacal`, so a
`pkill omacal` kills their calendar.

Run cleanup after every run, including failed ones. `launch` refuses to start
while the previous instance is alive.

## Scripts

- `scripts/omacal-verify`: the entry point above. Subcommands: `build`,
  `launch`, `doctor`, `cli`, `ax`, `snap`, `env`, `run`, `cleanup`.
- `scripts/ax.swift`: the AX driver, compiled by `build` to
  `target/verify/bin/ax`. Run it directly as `target/verify/bin/ax <verb> <pid> …`
  only when you need another pid.

## Feature map

`features/README.md` indexes the user-facing features and the recipe for
each one. Before claiming a feature works, drive every entry point that its
file lists.
