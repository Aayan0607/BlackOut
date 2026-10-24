import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function setup(page: Page, deviceName: string) {
  await page.goto('/')
  await page.getByLabel('Device name', { exact: true }).fill(deviceName)
  await page.getByRole('button', { name: 'Save device name', exact: true }).click()
  await expect(page.getByText('Device name saved.')).toBeVisible()
  await expect(page.locator('.sidebar-status')).toContainText('Ready for offline use')
}

test('expedition views support assigned checkpoints, filtering, history and offline reopening', async ({
  page,
  context,
}) => {
  await setup(page, 'Ridge Team')
  await page.getByLabel('Expedition name', { exact: true }).fill('Phase 2 expedition')
  await page.getByRole('button', { name: 'Create expedition', exact: true }).click()
  await page.getByRole('button', { name: '＋ checkpoint', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toHaveValue(
    'checkpoint',
  )
  await page.getByLabel('Title', { exact: true }).fill('Reach the ridge')
  await page.getByLabel('Location / checkpoint', { exact: true }).fill('Camp 2')
  await page.getByLabel('Assigned team / person', { exact: true }).fill('Scout team')
  await page.getByRole('button', { name: 'Save field record', exact: true }).click()
  await expect(page.locator('article')).toContainText('Scout team')
  await page.getByRole('button', { name: '＋ hazard', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Loose rocks')
  await page.getByLabel('Location / checkpoint', { exact: true }).fill('camp 2')
  await page.getByRole('button', { name: 'Save field record', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Record category', exact: true })
    .selectOption('checkpoint')
  await page
    .getByRole('combobox', { name: 'Assigned team', exact: true })
    .selectOption('name:Scout team')
  await expect(page.locator('article')).toHaveCount(1)
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(page.locator('article')).toHaveCount(2)
  await page.getByRole('button', { name: 'Checkpoint board', exact: true }).click()
  await expect(page.locator('.checkpoint-group')).toHaveCount(1)
  await expect(page.locator('.checkpoint-item').first()).toContainText('Loose rocks')
  await page.getByRole('button', { name: /Reach the ridge/ }).click()
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('done')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Record saved on this device.')).toBeVisible()
  await page.getByRole('button', { name: 'Close record', exact: true }).click()
  await expect(page.locator('.checkpoint-count')).toContainText('1 / 1')
  await page.screenshot({ path: 'test-results/phase2-board-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  await page.getByLabel('Search activity', { exact: true }).fill('Reach the ridge')
  await expect(page.locator('.activity-list li')).toHaveCount(2)
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: 'Checkpoint board', exact: true }).click()
  await expect(page.locator('.checkpoint-count')).toContainText('1 / 1')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/phase2-board-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'All records', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
async function newRecord(page: Page, title: string) {
  await page.getByRole('button', { name: /Add field record/ }).click()
  await page.getByLabel('Title', { exact: true }).fill(title)
  await page.getByLabel('Field notes', { exact: true }).fill('Recorded without connectivity.')
  await page.getByRole('button', { name: 'Save field record', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
}
async function editAssignee(page: Page, title: string, value: string) {
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    .getByRole('button', { name: 'Open record' })
    .click()
  await page.getByLabel('assignee', { exact: true }).fill(value)
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Record saved on this device.')).toBeVisible()
  await page.getByRole('button', { name: 'Close record' }).click()
}
async function outgoing(page: Page): Promise<Buffer> {
  await page.getByRole('button', { name: 'Exchange updates', exact: false }).click()
  await page.getByRole('button', { name: 'Send updates', exact: true }).click()
  await page.getByRole('button', { name: /Prepare update codes|Refresh outgoing snapshot/ }).click()
  await expect(page.getByRole('button', { name: 'Download exchange file' })).toBeEnabled()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download exchange file' }).click()
  return readFile((await (await download).path())!)
}
async function incoming(page: Page, buffer: Buffer, join = false) {
  await page.getByRole('button', { name: 'Exchange updates', exact: false }).click()
  await page.getByRole('button', { name: 'Receive updates', exact: true }).click()
  await page
    .getByLabel('Import exchange file', { exact: false })
    .setInputFiles({ name: 'exchange.blackout.json', mimeType: 'application/json', buffer })
  await page
    .getByRole('button', {
      name: join ? 'Join this expedition' : 'Merge into expedition',
      exact: true,
    })
    .click()
  if (!join) await expect(page.getByRole('status').last()).toContainText(/Saved|Already received/)
  await page.getByRole('button', { name: /Field log/ }).click()
}

test('two isolated devices reopen offline, merge, resolve conflicts, and reject wrong-workspace files', async ({
  browser,
}) => {
  const ca = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  const cb = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  const alice = await ca.newPage(),
    bob = await cb.newPage()
  const errors: string[] = []
  alice.on('pageerror', (e) => errors.push(e.message))
  bob.on('pageerror', (e) => errors.push(e.message))
  await setup(alice, 'Ridge Team')
  await setup(bob, 'Valley Team')
  await alice.getByLabel('Expedition name', { exact: true }).fill('Northern Ridge Survey')
  await alice.getByRole('button', { name: 'Create expedition', exact: true }).click()
  await newRecord(alice, 'Next checkpoint')
  await incoming(bob, await outgoing(alice), true)
  await expect(bob.getByRole('heading', { name: 'Next checkpoint', exact: true })).toBeVisible()
  await ca.setOffline(true)
  await cb.setOffline(true)
  await alice.reload()
  await bob.reload()
  await expect(alice.locator('.device-pill')).toContainText('Network offline')
  await expect(alice.locator('.sidebar-status')).toContainText('Ready for offline use')
  await expect(bob.getByRole('heading', { name: 'Next checkpoint', exact: true })).toBeVisible()
  await newRecord(alice, 'Bridge closed')
  await newRecord(bob, 'Water found')
  await editAssignee(alice, 'Next checkpoint', 'Ravi')
  await editAssignee(bob, 'Next checkpoint', 'Neha')
  await incoming(bob, await outgoing(alice))
  await expect(bob.locator('article')).toHaveCount(3)
  await expect(bob.getByText('Conflicting edits need review')).toBeVisible()
  await incoming(alice, await outgoing(bob))
  await expect(alice.locator('article')).toHaveCount(3)
  await alice
    .locator('article')
    .filter({ hasText: 'Next checkpoint' })
    .getByRole('button', { name: 'Open record' })
    .click()
  await alice.getByRole('button', { name: 'Use: Neha', exact: true }).click()
  await expect(alice.getByText('Different decisions were recorded.')).toHaveCount(0)
  await alice.getByRole('button', { name: 'Close record' }).click()
  const resolved = await outgoing(alice)
  await incoming(bob, resolved)
  await incoming(bob, resolved)
  await expect(bob.locator('article')).toHaveCount(3)
  await expect(bob.getByText('Conflicting edits need review')).toHaveCount(0)
  await bob.reload()
  await expect(bob.locator('article')).toHaveCount(3)
  await bob.screenshot({ path: 'test-results/desktop.png', fullPage: true })
  await bob.getByRole('button', { name: 'Create / join expedition', exact: false }).click()
  await bob.getByRole('button', { name: /Field log/ }).click()
  await bob.getByLabel('Expedition name', { exact: true }).fill('Different expedition')
  await bob.getByRole('button', { name: 'Create expedition', exact: true }).click()
  await bob.getByRole('button', { name: 'Exchange updates', exact: false }).click()
  await bob.getByRole('button', { name: 'Receive updates', exact: true }).click()
  await bob
    .getByLabel('Import exchange file', { exact: false })
    .setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: resolved })
  await expect(bob.getByRole('alert')).toContainText('different expedition')
  expect(errors).toEqual([])
  await ca.close()
  await cb.close()
})

test('generated QR images decode offline and a partial scan resumes after reload', async ({
  browser,
}) => {
  const ca = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  const cb = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  const alice = await ca.newPage(),
    bob = await cb.newPage()
  await setup(alice, 'Sender')
  await setup(bob, 'Receiver')
  await alice.getByLabel('Expedition name', { exact: true }).fill('Optical test')
  await alice.getByRole('button', { name: 'Create expedition', exact: true }).click()
  await alice.getByRole('button', { name: 'Exchange updates', exact: false }).click()
  await alice.getByRole('button', { name: 'Prepare update codes' }).click()
  await expect(alice.getByRole('img', { name: /BlackOut transfer frame/ })).toBeVisible()
  const alt = await alice.getByRole('img', { name: /BlackOut transfer frame/ }).getAttribute('alt')
  const total = Number(alt!.split(' of ')[1])
  await bob.getByRole('button', { name: 'Exchange updates', exact: false }).click()
  await ca.setOffline(true)
  await cb.setOffline(true)
  for (let i = 0; i < total; i++) {
    if (i > 0) {
      const previous = await alice
        .getByRole('img', { name: /BlackOut transfer frame/ })
        .getAttribute('src')
      await alice.getByRole('button', { name: 'Next QR frame', exact: true }).click()
      await expect(alice.getByRole('img', { name: /BlackOut transfer frame/ })).not.toHaveAttribute(
        'src',
        previous!,
      )
    }
    const src = await alice
      .getByRole('img', { name: /BlackOut transfer frame/ })
      .getAttribute('src')
    await bob.getByLabel('Read QR image', { exact: false }).setInputFiles({
      name: 'qr.png',
      mimeType: 'image/png',
      buffer: Buffer.from(src!.split(',')[1], 'base64'),
    })
    await expect(
      bob.getByText(`${i + 1} / ${total} frames received`, { exact: true }),
    ).toBeVisible()
    if (i === 0 && total > 1) {
      await bob.reload()
      await bob.getByRole('button', { name: 'Exchange updates', exact: false }).click()
      await expect(bob.getByText(`1 / ${total} frames received`, { exact: true })).toBeVisible()
    }
  }
  await bob.getByRole('button', { name: 'Join this expedition', exact: true }).click()
  await bob.getByRole('button', { name: /Field log/ }).click()
  await expect(bob.getByRole('heading', { name: 'Optical test', exact: true })).toBeVisible()
  await ca.close()
  await cb.close()
})

test('phone layout has no horizontal overflow and camera errors offer a fallback', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 390, height: 844 },
    isMobile: true,
  })
  const page = await context.newPage()
  await page.goto('/')
  await page.getByLabel('Device name', { exact: true }).fill('Phone')
  await page.getByRole('button', { name: 'Save device name', exact: true }).click()
  await page.getByRole('button', { name: 'Exchange updates', exact: false }).click()
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Camera unavailable')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true })
  await context.close()
})
