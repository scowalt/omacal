import { test, expect, type Page } from '@playwright/test';
import { APP_WRITE_CALENDARS, APP_GUESTS_ID, POPOVER_DETAILS } from './fixtures';

const HOME_ID = 50001;
// The shared title deliberately ignores pointer events once the panels open.
// Move a real pointer into the event instead of requiring that label to stay
// the hit target, as locator.hover() does throughout its action.
async function hoverCombined(page: Page) {
  const block = page.locator('.ev').filter({ hasText: 'Client call' });
  await block.scrollIntoViewIfNeeded();
  const box = (await block.boundingBox())!;
  await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2);
}

async function grabCopy(page: Page, name = 'Home', edge: 'start' | 'end' | null = null) {
  await hoverCombined(page);
  const block = page.locator('.ev').filter({ hasText: 'Client call' });
  const copy = page.getByRole('button', { name: `Open ${name} copy`, exact: true });
  const before = (await block.boundingBox())!;
  const panel = (await copy.boundingBox())!;
  const col = await block.evaluate(el => {
    const r = el.closest('.col')!.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  const x = panel.x + panel.width / 2;
  const y = edge === 'start' ? panel.y + 2 : edge === 'end' ? panel.y + panel.height - 2 : panel.y + panel.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  return { block, before, col, x, y };
}

const updates = (page: Page) => page.evaluate(() => window.__harness.calls.filter(c => c.cmd === 'update_event'));

async function setup(page: Page, homeReadOnly = false, open = true) {
  const work = POPOVER_DETAILS[APP_GUESTS_ID];
  const home = { ...work, id: HOME_ID, calendar_id: 20, description: 'Personal notes',
    attendees: [], can_edit: !homeReadOnly, color: '#20b080' };
  const calendars = [...APP_WRITE_CALENDARS, { ...APP_WRITE_CALENDARS[2], id: 20,
    summary: 'Home', account_id: 2, account_email: 'personal@example.com',
    access_role: homeReadOnly ? 'reader' : 'owner' }];
  await page.addInitScript(({ work, home, calendars }) => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      set(ipc) {
        const invoke = ipc.invoke;
        ipc.invoke = async (cmd: string, args: any, ...rest: any[]) => {
          if (cmd === 'get_calendars') return calendars;
          if ((cmd === 'event_detail' || cmd === 'refresh_event') && args.id === home.id) return home;
          const result = await invoke(cmd, args, ...rest);
          if (['get_week', 'get_range', 'get_day'].includes(cmd)) {
            for (const day of result.days) for (const event of day.events) {
              if (event.id !== work.id) continue;
              event.copies = [
                { id: event.id, calendar_id: work.calendar_id, start_ms: event.start_ms, end_ms: event.end_ms, color: '#5577ee' },
                { id: home.id, calendar_id: home.calendar_id, start_ms: event.start_ms, end_ms: event.end_ms, color: '#20b080' },
              ];
            }
          }
          return result;
        };
        Object.defineProperty(window, '__TAURI_INTERNALS__', { value: ipc, configurable: true });
      },
    });
  }, { work, home, calendars });
  await page.goto('/tests/harness/index.html?c=App&f=writable');
  if (open) {
    await hoverCombined(page);
    await page.getByRole('button', { name: 'Open Personal copy', exact: true }).click();
  }
}

test('hover fills a shared event with the selected calendar color and opens its normal details', async ({ page }) => {
  await setup(page, false, false);
  const block = page.locator('.ev').filter({ hasText: 'Client call' });
  await block.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(block).toHaveCSS('background-image', 'none');
  await expect(block.locator('.calendar-colors > span')).toHaveCount(2);
  const markers = await block.locator('.calendar-colors').boundingBox();
  const resting = (await block.boundingBox())!;
  expect(markers!.height).toBe(3);
  expect(markers!.y + markers!.height).toBeCloseTo(resting.y + resting.height, 0);
  await hoverCombined(page);
  await expect(block.locator('.calendar-colors')).toHaveCount(0);
  await expect(block).toHaveCSS('background-image', 'none');
  await expect(block.locator(':scope > b')).toHaveText('Client call');
  const home = page.getByRole('button', { name: 'Open Home copy', exact: true });
  const personal = page.getByRole('button', { name: 'Open Personal copy', exact: true });
  await expect(home).toBeVisible();
  const fill = block.locator('..').locator('.copy-color');
  await expect(fill).toHaveCount(1);
  await home.hover();
  await expect(fill).toHaveCSS('box-shadow', /rgb\(32, 176, 128\)/);
  await personal.hover();
  await expect(fill).toHaveCSS('box-shadow', /rgb\(85, 119, 238\)/);
  const whole = (await block.boundingBox())!;
  const first = (await personal.boundingBox())!;
  const second = (await home.boundingBox())!;
  expect(first.x).toBeCloseTo(whole.x, 0);
  expect(second.x + second.width).toBeCloseTo(whole.x + whole.width, 0);
  expect(first.width).toBeCloseTo(whole.width / 2, 0);
  expect(second.width).toBeCloseTo(first.width, 0);
  expect(second.height).toBeCloseTo(whole.height, 0);
  expect(second.x).toBeCloseTo(first.x + first.width, 0);
  await expect(home.locator('svg')).toHaveCount(0);
  const titleIsAbovePanels = await block.locator(':scope > b').evaluate((el, panel) => {
    const text = el.getBoundingClientRect();
    const x = (Math.max(text.left, panel.x) + Math.min(text.right, panel.x + panel.width)) / 2;
    const y = text.top + text.height / 2;
    // The shared label is intentionally pointer-transparent. Include it in
    // hit testing briefly to verify paint order without changing its layers.
    const before = el.style.pointerEvents;
    el.style.pointerEvents = 'auto';
    const hit = document.elementFromPoint(x, y);
    el.style.pointerEvents = before;
    return hit === el;
  }, first);
  expect(titleIsAbovePanels).toBe(true);

  // A click through the shared title must reach the colored panel beneath it.
  await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2);
  const details = page.getByRole('dialog', { name: 'Client call', exact: true });
  await expect(details).toBeVisible();
  await expect(page.getByLabel('Calendar copy', { exact: true })).toHaveValue(String(APP_GUESTS_ID));
  await expect(page.getByRole('dialog', { name: 'Edit event', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.move(0, 0);
  await hoverCombined(page);
  await home.click();
  await expect(details).toContainText('Personal notes');
  await expect(page.getByLabel('Calendar copy', { exact: true })).toHaveValue(String(HOME_ID));
  await expect(page.getByRole('dialog', { name: 'Edit event', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__harness.calls.filter(c => ['update_event', 'create_event'].includes(c.cmd)))).toEqual([]);
  await details.getByRole('button', { name: 'Edit', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Edit event', exact: true });
  await form.getByLabel('Title', { exact: true }).fill('Home call');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toHaveCount(0);
  const writes = await page.evaluate(() => window.__harness.calls.filter(c => c.cmd === 'update_event'));
  expect(writes).toHaveLength(1);
  expect(writes[0].args).toMatchObject({ id: HOME_ID, fields: { summary: 'Home call' } });
});

test('copy panels are keyboard accessible and read-only copies open details', async ({ page }) => {
  await setup(page, true, false);
  const block = page.locator('.ev').filter({ hasText: 'Client call' });
  await block.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Open Personal copy', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  const home = page.getByRole('button', { name: 'Open Home copy', exact: true });
  await expect(home).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Client call', exact: true })).toContainText('Personal notes');
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__harness.calls.filter(c => ['update_event', 'create_event'].includes(c.cmd)))).toEqual([]);
});

test('leaving a combined event restores color segments and Alt suppresses the copy panels', async ({ page }) => {
  await setup(page, false, false);
  const block = page.locator('.ev').filter({ hasText: 'Client call' });
  await hoverCombined(page);
  const panel = page.getByRole('button', { name: 'Open Home copy', exact: true });
  await expect(panel).toBeVisible();
  await page.keyboard.down('Alt');
  await expect(panel).toHaveCount(0);
  await expect(block).toHaveCSS('cursor', 'crosshair');
  await page.keyboard.up('Alt');
  await expect(panel).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(panel).toHaveCount(0);
  await expect(block).toHaveCSS('background-image', 'none');
  await expect(block.locator('.calendar-colors > span')).toHaveCount(2);
});

test('a combined event shows both colors and lets Edit target the selected calendar copy', async ({ page }) => {
  await setup(page);
  const block = page.locator('.ev').filter({ hasText: 'Client call' });
  await expect(block).toHaveAttribute('data-combined-count', '2');
  await page.mouse.move(0, 0);
  await expect(block).toHaveCSS('background-image', 'none');
  await expect(block.locator('.calendar-colors > span')).toHaveCount(2);
  await expect(block.locator('.calendar-colors > span').nth(0)).toHaveCSS('background-color', 'rgb(85, 119, 238)');
  await expect(block.locator('.calendar-colors > span').nth(1)).toHaveCSS('background-color', 'rgb(32, 176, 128)');
  const picker = page.getByLabel('Calendar copy', { exact: true });
  await expect(picker.locator('option')).toHaveCount(2);
  await picker.selectOption(String(HOME_ID));
  await expect(page.getByRole('dialog', { name: 'Client call' })).toContainText('Personal notes');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Edit event', exact: true });
  await expect(form.getByRole('button', { name: 'Calendar', exact: true })).toBeDisabled();
  await form.getByLabel('Title', { exact: true }).fill('Personal call');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toHaveCount(0);
  const writes = await page.evaluate(() => window.__harness.calls.filter((c) => c.cmd === 'update_event'));
  expect(writes).toHaveLength(1);
  expect(writes[0].args).toMatchObject({ id: HOME_ID, fields: { summary: 'Personal call' } });
});

test('combined copy selection honors read-only calendars', async ({ page }) => {
  await setup(page, true);
  await page.getByLabel('Calendar copy', { exact: true }).selectOption(String(HOME_ID));
  await expect(page.getByRole('dialog', { name: 'Client call' })).toContainText('Personal notes');
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Duplicate', exact: true })).toBeVisible();
  await page.getByLabel('Calendar copy', { exact: true }).selectOption(String(APP_GUESTS_ID));
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
});

test('the combined calendar selector also works in list view', async ({ page }) => {
  await setup(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  await page.getByRole('button', { name: /Client call/ }).click();
  await page.getByLabel('Calendar copy', { exact: true }).selectOption(String(HOME_ID));
  await expect(page.getByRole('dialog', { name: 'Client call' })).toContainText('Personal notes');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete event' }).getByRole('button', { name: 'Delete', exact: true }).click();
  const writes = await page.evaluate(() => window.__harness.calls.filter((c) => c.cmd === 'delete_event_cmd'));
  expect(writes).toHaveLength(1);
  expect(writes[0].args).toMatchObject({ id: HOME_ID });
});


test('combining is opt-in, saves immediately, reloads the calendar and survives reopening preferences', async ({ page }) => {
  await page.goto('/tests/harness/index.html?c=App&f=writable');
  const openSettings = async () => {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('button', { name: 'Settings…', exact: true }).click();
    await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  };
  await openSettings();
  const toggle = page.getByRole('checkbox', { name: 'Combine identical events', exact: true });
  await expect(toggle).not.toBeChecked();
  const reads = () => page.evaluate(() => window.__harness.calls.filter(c => ['get_week', 'get_range', 'get_day'].includes(c.cmd)).length);
  const before = await reads();
  await toggle.check();
  await expect.poll(reads).toBeGreaterThan(before);
  await page.keyboard.press('Escape');
  await openSettings();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect.poll(() => page.evaluate(() => window.__harness.settingValues('combineIdenticalEvents'))).toEqual([true, false]);
});

test('dragging a combined calendar copy previews moving that event', async ({ page }) => {
  await setup(page, false, false);
  const { block, before, x, y } = await grabCopy(page);
  await page.mouse.move(x, y + 40, { steps: 5 });
  await expect(block).toHaveClass(/dragging/);
  expect((await block.boundingBox())!.y).toBeGreaterThan(before.y);
  await expect(block).toHaveCSS('box-shadow', /rgb\(32, 176, 128\)/);
  await expect(block).toHaveCSS('cursor', 'grabbing');
  await expect(page.locator('.copy-panels')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(block).not.toHaveClass(/dragging/);
  expect((await block.boundingBox())!.y).toBeCloseTo(before.y, 0);
  await page.mouse.up();
  expect(await updates(page)).toEqual([]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Cancelling must not swallow the next genuine copy click.
  await hoverCombined(page);
  await page.getByRole('button', { name: 'Open Home copy', exact: true }).click();
  await expect(page.getByLabel('Calendar copy', { exact: true })).toHaveValue(String(HOME_ID));
});

for (const copy of [
  { name: 'Personal', id: APP_GUESTS_ID, color: /rgb\(85, 119, 238\)/, guests: true },
  { name: 'Home', id: HOME_ID, color: /rgb\(32, 176, 128\)/, guests: false },
]) {
  test(`dragging the ${copy.name} panel moves only that combined calendar copy`, async ({ page }) => {
    await setup(page, false, false);
    await hoverCombined(page);
    await expect(page.getByRole('button', { name: `Open ${copy.name} copy`, exact: true })).toHaveCSS('cursor', 'grab');
    const { block, before, col, x, y } = await grabCopy(page, copy.name);
    const dy = col.height / 24; // one hour, independent of grid zoom
    await page.mouse.move(x + col.width, y + dy, { steps: 8 });
    await expect(block).toHaveClass(/dragging/);
    await expect(block).toHaveCSS('box-shadow', copy.color);
    const during = (await block.boundingBox())!;
    expect(during.x - before.x).toBeCloseTo(col.width, 0);
    expect(during.y - before.y).toBeCloseTo(dy, 0);
    expect(during.height).toBeCloseTo(before.height, 0);
    expect(await block.evaluate(el => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === el || el.contains(hit);
    })).toBe(true);
    await page.mouse.up();
    const confirm = page.getByRole('dialog', { name: 'Move event', exact: true });
    if (copy.guests) {
      await expect(confirm).toBeVisible();
      expect(await updates(page)).toEqual([]);
      await confirm.getByRole('button', { name: 'Move without notifying', exact: true }).click();
    }
    await expect.poll(() => updates(page)).toHaveLength(1);
    const original = POPOVER_DETAILS[APP_GUESTS_ID];
    expect((await updates(page))[0].args).toMatchObject({
      id: copy.id, occurrenceStartMs: original.start_ms, occurrenceEndMs: original.end_ms,
      sendUpdates: 'none', fields: { when: {
        startMs: original.start_ms + 25 * 3_600_000,
        endMs: original.end_ms + 25 * 3_600_000,
      } },
    });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

for (const edge of ['start', 'end'] as const) {
  test(`resizing a combined copy's ${edge} edge writes only that edge and copy`, async ({ page }) => {
    await setup(page, false, false);
    const { block, before, col, x, y } = await grabCopy(page, 'Home', edge);
    expect(before.height, 'fixture must have resize bands').toBeGreaterThan(18);
    const dy = col.height / 48 * (edge === 'start' ? -1 : 1);
    await page.mouse.move(x, y + dy, { steps: 6 });
    await expect(block).toHaveClass(/dragging/);
    expect((await block.boundingBox())!.height - before.height).toBeCloseTo(Math.abs(dy), 0);
    await page.mouse.up();
    await expect.poll(() => updates(page)).toHaveLength(1);
    const original = POPOVER_DETAILS[APP_GUESTS_ID];
    expect((await updates(page))[0].args).toMatchObject({ id: HOME_ID, fields: { when: {
      startMs: original.start_ms - (edge === 'start' ? 30 * 60_000 : 0),
      endMs: original.end_ms + (edge === 'end' ? 30 * 60_000 : 0),
    } } });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test('a combined copy dropped back on its own slot writes nothing and opens no details', async ({ page }) => {
  await setup(page, false, false);
  const { block, x, y } = await grabCopy(page);
  await page.mouse.move(x, y + 10, { steps: 4 });
  await expect(block).toHaveClass(/dragging/);
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300); // allow an incorrectly dispatched async write to appear
  expect(await updates(page)).toEqual([]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a combined copy press below the drag threshold still opens its details', async ({ page }) => {
  await setup(page, false, false);
  const { block, x, y } = await grabCopy(page);
  await page.mouse.move(x, y + 3, { steps: 3 });
  await expect(block).not.toHaveClass(/dragging/);
  await page.mouse.up();
  await expect(page.getByLabel('Calendar copy', { exact: true })).toHaveValue(String(HOME_ID));
  expect(await updates(page)).toEqual([]);
});

test('a read-only combined copy cannot be dragged or written', async ({ page }) => {
  await setup(page, true, false);
  await hoverCombined(page);
  await expect(page.getByRole('button', { name: 'Open Home copy', exact: true })).toHaveCSS('cursor', 'pointer');
  const { block, x, y } = await grabCopy(page);
  await page.mouse.move(x, y + 40, { steps: 5 });
  await expect(block).not.toHaveClass(/dragging/);
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await updates(page)).toEqual([]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a combined copy still saving cannot be dragged a second time', async ({ page }) => {
  await setup(page, false, false);
  await page.evaluate(() => window.__harness.holdNextWrite('update_event'));
  const first = await grabCopy(page);
  await page.mouse.move(first.x, first.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => updates(page)).toHaveLength(1);
  await hoverCombined(page);
  await expect(page.getByRole('button', { name: 'Open Home copy', exact: true })).toHaveCSS('cursor', 'pointer');
  const second = await grabCopy(page);
  await page.mouse.move(second.x, second.y + 40, { steps: 5 });
  await expect(second.block).not.toHaveClass(/dragging/);
  await page.mouse.up();
  expect(await updates(page)).toHaveLength(1);
});

test('a combined block still allows Alt-drag creation', async ({ page }) => {
  await setup(page, false, false);
  const block = page.locator('.ev').filter({ hasText: 'Client call' });
  await block.scrollIntoViewIfNeeded();
  const box = (await block.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.keyboard.down('Alt');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 45, { steps: 5 });
  await expect(page.locator('.sweep')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const form = page.getByRole('dialog', { name: 'New event', exact: true });
  await expect(form.getByLabel('Title', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => window.__harness.calls.filter(c => ['update_event', 'create_event'].includes(c.cmd)))).toEqual([]);
});


test('combined colors leave tentative RSVP stripes visible', async ({ page }) => {
  await setup(page, false, false);
  // Change the real response class without changing the copy colors: the
  // two independent visual signals must remain legible together.
  const block = page.locator('.ev').filter({ hasText: 'Client call' });
  await block.evaluate(el => el.classList.add('tentative'));
  await expect(block).toHaveCSS('background-image', /repeating-linear-gradient/);
  await expect(block.locator('.calendar-colors > span')).toHaveCount(2);
});

for (const readOnly of [false, true]) {
  test(`right-clicking a shared calendar copy ${readOnly ? 'opens its read-only details' : 'edits that copy directly'}`, async ({ page }) => {
    await setup(page, readOnly, false);
    await hoverCombined(page);
    await page.getByRole('button', { name: 'Open Home copy', exact: true }).click({ button: 'right' });
    const details = page.getByRole('dialog', { name: 'Client call', exact: true });
    const form = page.getByRole('dialog', { name: 'Edit event', exact: true });
    if (readOnly) {
      await expect(details).toContainText('Personal notes');
      await expect(form).toHaveCount(0);
      await expect(page.getByLabel('Calendar copy', { exact: true })).toHaveValue(String(HOME_ID));
    } else {
      await expect(form).toBeVisible();
      await expect(details).toHaveCount(0);
      await form.getByLabel('Title', { exact: true }).fill('Home copy only');
      await form.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(form).toHaveCount(0);
      const writes = await page.evaluate(() => window.__harness.calls.filter(c => c.cmd === 'update_event'));
      expect(writes).toHaveLength(1);
      expect(writes[0].args).toMatchObject({ id: HOME_ID, fields: { summary: 'Home copy only' } });
    }
  });
}

test('a right drag on a shared copy neither edits nor moves it', async ({ page }) => {
  await setup(page, false, false);
  await hoverCombined(page);
  const copy = page.getByRole('button', { name: 'Open Home copy', exact: true });
  const box = (await copy.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 3;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(x, y + 15, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  await expect(page.getByRole('dialog', { name: 'Edit event', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Client call', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__harness.calls.filter(c => ['update_event', 'move_event', 'create_event'].includes(c.cmd)))).toEqual([]);
});
