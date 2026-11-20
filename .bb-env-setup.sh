#!/usr/bin/env sh
# Prepares a new bb worktree: the Tauri frontend's npm packages and the Rust crates.
# A failed step is reported and skipped, so the worktree still opens.
set -u

run_step() {
  name="$1"
  shift
  printf '[bb-env-setup] Running: %s\n' "${name}"
  if "$@"; then
    printf '[bb-env-setup] Completed: %s\n' "${name}"
  else
    printf '[bb-env-setup] Warning: %s failed (exit %s); continuing\n' "${name}" "$?"
  fi
}

if command -v npm >/dev/null 2>&1; then
  run_step "npm ci in ui" npm --prefix ui ci --no-audit --no-fund
else
  printf '[bb-env-setup] Warning: npm not found; skipping ui packages\n'
fi

if command -v cargo >/dev/null 2>&1; then
  run_step "cargo fetch" cargo fetch --locked
else
  printf '[bb-env-setup] Warning: cargo not found; skipping crate download\n'
fi
