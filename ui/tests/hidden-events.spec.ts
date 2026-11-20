// Settings → Calendars → Hidden events: the list of titles whose events are
// hidden everywhere. The rule itself is the store's (`events::hide_titles`);
// what this drives is the form, and that the calendar is asked again when the
// list changes — the grid is drawn from what the backend answers, so a list
// saved without a refetch would hide nothing until the next sync.

import { test, expect, type Page } from '@playwright/test';

const openCalendars = async (page: Page) => {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Settings…', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Settings' });
  await modal.getByRole('tab', { name: 'Calendars', exact: true }).click();
  return modal;
};

const saved = (page: Page) => page.evaluate(() => (window as any).__harness.settingValues('hiddenEventTitles'));
const reads = (page: Page) =>
  page.evaluate(() => (window as any).__harness.calls.filter((c: any) => ['get_week', 'get_range', 'get_day'].includes(c.cmd)).length);

test('a title typed and added is saved as the whole list, shown, and survives reopening', async ({ page }) => {
  await page.goto('/tests/harness/index.html?c=App&f=writable');
  let modal = await openCalendars(page);
  const box = modal.getByLabel('Event title to hide');
  await expect(modal.getByRole('button', { name: /^Show events titled/ })).toHaveCount(0);

  await box.fill('  (personal event) ');
  await box.press('Enter');
  await expect(modal.getByRole('button', { name: 'Show events titled (personal event)' })).toBeVisible();
  await expect(box).toHaveValue('');
  // Trimmed before it is sent; the stub stores what it is told.
  expect(await saved(page)).toEqual([['(personal event)']]);

  await box.fill('Focus');
  await modal.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(modal.getByRole('button', { name: /^Show events titled/ })).toHaveCount(2);
  expect((await saved(page)).at(-1)).toEqual(['(personal event)', 'Focus']);

  await page.keyboard.press('Escape');
  modal = await openCalendars(page);
  await expect(modal.getByRole('button', { name: 'Show events titled Focus' })).toBeVisible();
});

test('a blank title writes nothing', async ({ page }) => {
  await page.goto('/tests/harness/index.html?c=App&f=writable');
  const modal = await openCalendars(page);
  const box = modal.getByLabel('Event title to hide');
  await expect(modal.getByRole('button', { name: 'Hide', exact: true })).toBeDisabled();
  await box.fill('   ');
  await box.press('Enter');
  await expect(modal.getByRole('button', { name: /^Show events titled/ })).toHaveCount(0);
  expect(await saved(page)).toEqual([]);
});

test('removing a title saves the list without it', async ({ page }) => {
  await page.goto('/tests/harness/index.html?c=App&f=writable');
  const modal = await openCalendars(page);
  const box = modal.getByLabel('Event title to hide');
  for (const title of ['One', 'Two']) {
    await box.fill(title);
    await box.press('Enter');
    await expect(modal.getByRole('button', { name: `Show events titled ${title}` })).toBeVisible();
  }
  await modal.getByRole('button', { name: 'Show events titled One' }).click();
  await expect(modal.getByRole('button', { name: /^Show events titled/ })).toHaveText(['×']);
  expect((await saved(page)).at(-1)).toEqual(['Two']);
});

test('changing the list reloads the calendar, in both directions', async ({ page }) => {
  await page.goto('/tests/harness/index.html?c=App&f=writable');
  const modal = await openCalendars(page);
  const box = modal.getByLabel('Event title to hide');
  const before = await reads(page);
  await box.fill('(personal event)');
  await box.press('Enter');
  await expect.poll(() => reads(page)).toBeGreaterThan(before);

  const afterAdd = await reads(page);
  await modal.getByRole('button', { name: 'Show events titled (personal event)' }).click();
  await expect.poll(() => reads(page)).toBeGreaterThan(afterAdd);
});
