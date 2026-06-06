import { expect, test } from '@playwright/test';

test('mobile session, hand, undo, export, and no-scroll table viewport', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Start session/i }).click();
  await page.getByRole('button', { name: 'Hand' }).click();
  await page.getByRole('button', { name: /Call 5/i }).click();
  await page.getByRole('button', { name: /Villain 1/i }).click();
  await page.getByRole('button', { name: /Call 3/i }).click();
  await page.getByRole('button', { name: /Villain 2/i }).click();
  await page.getByRole('button', { name: /Check/i }).click();
  await page.getByRole('button', { name: /Undo/i }).click();
  await page.getByRole('button', { name: /Check/i }).click();
  await page.getByPlaceholder('AhKdQs').fill('2c3d4h');
  await page.getByRole('button', { name: 'Board' }).click();
  await page.getByRole('button', { name: /Villain 1/i }).click();
  await page.getByRole('button', { name: /Check/i }).click();
  await page.getByRole('button', { name: /Villain 2/i }).click();
  await page.getByRole('button', { name: /Check/i }).click();
  await page.getByRole('button', { name: /Hero/i }).click();
  await page.getByRole('button', { name: /Bet/i }).click();
  await page.getByRole('button', { name: /Villain 1/i }).click();
  await page.getByRole('button', { name: /Fold/i }).click();
  await page.getByRole('button', { name: /Villain 2/i }).click();
  await page.getByRole('button', { name: /Fold/i }).click();
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByLabel('Exported hand history')).toContainText('PokerStars Hand');

  await page.getByRole('button', { name: 'Table' }).click();
  const scroll = await page.evaluate(() => ({
    body: document.body.scrollHeight,
    viewport: window.innerHeight,
    shell: document.querySelector('.table-page')?.getBoundingClientRect().height,
  }));
  expect(scroll.body).toBeLessThanOrEqual(scroll.viewport + 2);
  expect(scroll.shell).toBeLessThanOrEqual(scroll.viewport);
  await expect(page.getByTestId('felt')).toBeVisible();
});
