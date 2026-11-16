import { test, expect, type Page } from '@playwright/test';
import { OOO } from './ooo-fixtures';

const app = (fixture = 'ooo') => `/tests/harness/index.html?c=App&f=${fixture}`;
const form = (page: Page) => page.getByRole('dialog', { name: 'Edit event' });
const chip = (page: Page) => page.locator('.band .chip');
const calls = (page: Page, cmd: string): Promise<any[]> => page.evaluate((c) => window.__harness.calls.filter((x) => x.cmd === c).map((x) => x.args), cmd);

const lastCall = async (page: Page, cmd: string) => {
  const all = await calls(page, cmd);
  return all[all.length - 1];
};

async function openEditor(page: Page) {
  await chip(page).click();
  await page.getByRole('dialog', { name: 'OOO (🍂)' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(form(page)).toBeVisible();
}

test.describe('Google OOO presentation', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(Date.UTC(2026, 9, 19, 12));
  });

  test('authored civil dates lead to a native timed editor and title-only submission', async ({ page }) => {
    await page.goto(app());
    await expect(chip(page)).toHaveText('‹ OOO (🍂)');
    await expect(page.locator('.ev')).toHaveCount(0);
    await chip(page).click();
    const popover = page.getByRole('dialog', { name: 'OOO (🍂)' });
    await expect(popover.locator('.when')).toContainText('Oct 16');
    await expect(popover.locator('.when')).toContainText('Oct 20');
    const detailCalls = await calls(page, 'event_detail');
    expect(detailCalls[0]).toMatchObject({ id: OOO.detail.id, occurrenceStartMs: 1792123200000, occurrenceEndMs: 1792555200000 });
    await popover.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(form(page).getByLabel('All day', { exact: true })).not.toBeChecked();
    await expect(form(page).getByLabel('All day', { exact: true })).toBeDisabled();
    await expect(form(page).getByLabel('Start', { exact: true })).toHaveValue('04:00');
    await expect(form(page).getByLabel('End', { exact: true })).toHaveValue('04:00');
    await form(page).getByLabel('Title', { exact: true }).fill('OOO title edit');
    await form(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form(page)).toHaveCount(0);
    expect((await calls(page, 'update_event'))[0].fields.when).toEqual({ kind: 'timed', startMs: 1792123200000, endMs: 1792555200000 });
    await expect(chip(page)).toContainText('OOO title edit');
    await expect(page.locator('.ev')).toHaveCount(0);
  });

  test('timing waits in the band while saving then reloads as timed', async ({ page }) => {
    await page.goto(app());
    await openEditor(page);
    await form(page).getByLabel('Start', { exact: true }).fill('05:00');
    await form(page).getByLabel('End', { exact: true }).fill('05:00');
    await page.evaluate(() => window.__harness.holdNextWrite('update_event'));
    await form(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(chip(page)).toContainText('OOO (🍂)');
    await expect(page.locator('.ev')).toHaveCount(0);
    const submitted = (await calls(page, 'update_event'))[0];
    expect(submitted.fields.when).toEqual({ kind: 'timed', startMs: 1792126800000, endMs: 1792558800000 });
    await page.evaluate(() => window.__harness.releaseWrite());
    await expect(chip(page)).toHaveCount(0);
    await expect(page.locator('.ev b').first()).toHaveText('OOO (🍂)');
  });

  test('a failed descriptive edit restores the original all-day chip', async ({ page }) => {
    await page.goto(app());
    await openEditor(page);
    await form(page).getByLabel('Title', { exact: true }).fill('OOO pending title');
    await page.evaluate(() => window.__harness.holdNextWrite('update_event'));
    await form(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(chip(page)).toContainText('OOO pending title');
    await expect(page.locator('.ev')).toHaveCount(0);
    await page.evaluate(() => window.__harness.rejectWrite('Synthetic save failed'));
    await expect(chip(page)).toHaveText('‹ OOO (🍂)');
    await expect(page.getByText('Synthetic save failed', { exact: false })).toBeVisible();
  });

  test('unknown-type and genuine native date-only controls keep their own routing', async ({ page }) => {
    await page.goto(app('ooo-controls'));
    await expect(chip(page)).toHaveCount(2);
    await expect(chip(page).filter({ hasText: 'Native date-only control' })).toHaveCount(1);
    await expect(chip(page).filter({ hasText: 'OOO (🍂)' })).toHaveCount(1);
    await expect(page.locator('.ev b').filter({ hasText: 'OOO unknown-type control' })).toHaveCount(3);
  });

  test('duplicate is an unrestricted timed draft', async ({ page }) => {
    await page.goto(app());
    await chip(page).click();
    await page.getByRole('dialog', { name: 'OOO (🍂)' }).getByRole('button', { name: 'Duplicate', exact: true }).click();
    const draft = page.getByRole('dialog', { name: 'New event' });
    await expect(draft.getByLabel('All day', { exact: true })).not.toBeChecked();
    await expect(draft.getByLabel('All day', { exact: true })).toBeEnabled();
    await expect(draft.getByLabel('Start', { exact: true })).toHaveValue('04:00');
    await expect(draft.getByLabel('End', { exact: true })).toHaveValue('04:00');
  });
});

test('a partial OOO move cannot offer a following split', async ({ page }) => {
  await page.clock.setFixedTime(Date.UTC(2026, 2, 8, 12));
  await page.goto(app('ooo-dst'));
  const timed = page.locator('.ev').filter({ hasText: 'OOO recurring' });
  await expect(timed).toHaveCount(1);
  await timed.scrollIntoViewIfNeeded();
  const box = (await timed.boundingBox())!;
  const pane = (await page.getByTestId('week-body').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = Math.max(box.y + 15, pane.y + 50);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 30, { steps: 8 });
  await page.mouse.up();
  const dialog = page.getByRole('dialog', { name: 'Move event' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'This and following', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await calls(page, 'update_event')).toHaveLength(0);
});

test('a nonqualifying recurring occurrence retains context through keyboard and refresh', async ({ page }) => {
  await page.clock.setFixedTime(Date.UTC(2026, 2, 8, 12));
  await page.goto(app('ooo-dst'));
  await expect(chip(page)).toHaveCount(1);
  const timed = page.locator('.ev').filter({ hasText: 'OOO recurring' });
  await expect(timed).toHaveCount(1);
  await timed.click();
  let popover = page.getByRole('dialog', { name: 'OOO recurring' });
  await expect(popover).toBeVisible();
  await expect(popover.locator('.when')).toContainText('05:00');
  const interval = { occurrenceStartMs: 1772946000000, occurrenceEndMs: 1773032400000 };
  expect(await lastCall(page, 'event_detail')).toMatchObject(interval);
  expect(await lastCall(page, 'refresh_event')).toMatchObject(interval);
  await page.keyboard.press('Escape');
  await page.keyboard.press('j');
  await expect(page.locator('[data-kbd-selected-event]')).toContainText('OOO recurring');
  await page.keyboard.press('Enter');
  popover = page.getByRole('dialog', { name: 'OOO recurring' });
  await expect(popover).toBeVisible();
  expect(await lastCall(page, 'event_detail')).toMatchObject(interval);
  await popover.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(form(page).getByLabel('All day', { exact: true })).not.toBeChecked();
  await expect(form(page).getByLabel('This and following')).toBeDisabled();
  await expect(form(page).getByLabel('Date', { exact: true })).toHaveValue('2026-03-08');
  await expect(form(page).getByLabel('End date', { exact: true })).toHaveValue('2026-03-09');
});
