import { test, expect } from '@playwright/test'

test('restarting during a simulated encounter cancels its pending update and preserves a real expedition', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Field log/ }).click()
  await page.getByLabel('Device name', { exact: true }).fill('Real device')
  await page.getByRole('button', { name: 'Save device name', exact: true }).click()
  await page.getByLabel('Expedition name', { exact: true }).fill('My real expedition')
  await page.getByRole('button', { name: 'Create expedition', exact: true }).click()
  await page.getByRole('button', { name: /Add field record/ }).click()
  await page.getByLabel('Title', { exact: true }).fill('Keep this checkpoint')
  await page.getByRole('button', { name: 'Save field record', exact: true }).click()
  await page.getByRole('button', { name: /Experience BlackOut/ }).click()
  await page.getByRole('button', { name: /Begin the expedition/ }).click()
  await page.getByRole('button', { name: /Pause autoplay/ }).click()
  await page.getByRole('button', { name: /Let Ridge meet Valley/ }).click()
  await expect(page.locator('.in-transit')).toBeVisible()
  await page.getByRole('button', { name: /Restart/ }).click()
  // Wait beyond the encounter's deadline to catch a late callback advancing the reset session.
  await page.waitForTimeout(1600)
  await expect(
    page.getByRole('heading', { name: 'One expedition. Three copies of the story.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Field log/ }).click()
  await expect(page.locator('article')).toHaveCount(1)
  await expect(
    page.getByRole('heading', { name: 'Keep this checkpoint', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'My real expedition', exact: true })).toBeVisible()
  await expect(page.locator('article')).toHaveCount(1)
})

test('a new visitor can complete the real-engine replay offline, inspect every camp, and start a field log', async ({
  page,
  context,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'The signal ends. The story doesn’t.' }),
  ).toBeVisible()
  await expect(page.locator('.sidebar-status')).toContainText('Ready for offline use')
  await page.screenshot({ path: 'test-results/experience-desktop.png', fullPage: true })
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: 'Explore at my pace', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Three teams. Three different stories.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Let Ridge meet Valley/ }).click()
  await expect(page.locator('.decision-box')).toBeVisible()
  await expect(page.locator('.camp-inspector')).toContainText('Decision needed')
  await page.getByRole('button', { name: 'Valley Team ↗', exact: true }).click()
  await expect(page.locator('.camp-inspector')).toContainText('Assigned to Valley Team')
  await page.getByRole('button', { name: /Carry it to Base Camp/ }).click()
  await expect(page.locator('.inspector-record-count')).toHaveText('04')
  await page.getByRole('button', { name: /Bring Base’s report to Valley/ }).click()
  await expect(
    page.getByRole('heading', { name: 'One last encounter closes the gap.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Return the full story to Ridge/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Four reports. One decision. Everyone caught up.' }),
  ).toBeVisible()
  const saved = await page.locator('.inspector-proof code').textContent()
  for (const team of ['Ridge Team', 'Valley Team', 'Base Camp']) {
    await page.getByRole('button', { name: `Inspect ${team}: 4 reports`, exact: true }).click()
    await expect(page.locator('.inspector-proof code')).toHaveText(saved!)
    await expect(page.locator('.camp-inspector')).toContainText('Assigned to Valley Team')
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/experience-complete.png', fullPage: true })
  // Replay lives entirely in memory; it must not create or switch a real expedition.
  await expect(
    page.getByRole('combobox', { name: 'Active expedition' }).locator('option'),
  ).toHaveCount(1)
  await page.getByRole('button', { name: /Field log/ }).click()
  await expect(page.getByLabel('Device name', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('replay fits a phone, supports keyboard selection, reduced motion, restart, and pause', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: /Start the blackout/ }).click()
  await page.getByRole('button', { name: /Pause autoplay/ }).click()
  const base = page.getByRole('button', { name: 'Inspect Base Camp: 2 reports', exact: true })
  await base.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.camp-inspector h3')).toHaveText('Base Camp')
  await expect(page.getByRole('button', { name: /Resume autoplay/ })).toBeVisible()
  await page.getByRole('button', { name: /Let Ridge meet Valley/ }).click()
  await expect(page.locator('.decision-box')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/experience-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: /Restart/ }).click()
  await expect(
    page.getByRole('heading', { name: 'One expedition. Three copies of the story.' }),
  ).toBeVisible()
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: /This device/ }).click()
  await expect(page.getByRole('region', { name: 'Offline kit' })).toContainText(
    'Ready for offline use',
  )
  await expect(page.locator('.kit-asset.complete')).toHaveCount(3)
  await page.screenshot({ path: 'test-results/offline-kit-mobile.png', fullPage: true })
})
