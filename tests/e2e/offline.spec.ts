import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('synthetic demo is isolated and survives backup recovery into a fresh offline profile', async ({
  browser,
}) => {
  const ca = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  const cb = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  const a = await ca.newPage(),
    b = await cb.newPage()
  await setup(a, 'Demo A')
  await setup(b, 'Demo B')
  await a.getByLabel('Expedition name', { exact: true }).fill('Keep my expedition')
  await a.getByRole('button', { name: 'Create expedition', exact: true }).click()
  await newRecord(a, 'Real placeholder retained')
  await a.getByRole('button', { name: /This device/ }).click()
  await a.getByRole('button', { name: 'Create demo expedition', exact: true }).click()
  await expect(
    a.getByRole('heading', { name: 'DEMO · Northern Ridge Expedition', exact: true }),
  ).toBeVisible()
  await a.getByRole('button', { name: 'All records', exact: true }).click()
  await expect(a.locator('article')).toHaveCount(8)
  await expect(a.locator('.conflict-flag')).toHaveCount(1)
  const backup = await outgoing(a)
  await ca.setOffline(true)
  await cb.setOffline(true)
  await incoming(b, backup, true)
  await expect(b.locator('article')).toHaveCount(8)
  await expect(b.locator('.conflict-flag')).toHaveCount(1)
  await b.reload()
  await expect(b.locator('article')).toHaveCount(8)
  await a
    .getByRole('combobox', { name: 'Active expedition', exact: true })
    .selectOption({ label: 'Keep my expedition' })
  await expect(
    a.getByRole('heading', { name: 'Real placeholder retained', exact: true }),
  ).toBeVisible()
  await expect(a.locator('article')).toHaveCount(1)
  await ca.close()
  await cb.close()
})

test('300 synthetic reports remain usable offline, paginate history, reject corrupt import, and export via file fallback', async ({
  page,
  context,
}) => {
  await setup(page, 'Endurance Browser')
  const buffer = await readFile('artifacts/synthetic/large.blackout.json')
  await incoming(page, buffer, true)
  await expect(page.locator('article')).toHaveCount(300)
  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  await expect(page.locator('.activity-list li')).toHaveCount(30)
  await page.getByRole('button', { name: 'Show more activity', exact: true }).click()
  await expect(page.locator('.activity-list li')).toHaveCount(60)
  await page.getByRole('button', { name: 'Checkpoint board', exact: true }).click()
  await expect(page.locator('.checkpoint-group')).toHaveCount(10)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('article')).toHaveCount(300)
  await page.getByLabel('Search records', { exact: true }).fill('Synthetic report 299')
  await expect(page.locator('article')).toHaveCount(1)
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  const downloaded = await outgoing(page)
  await expect(
    page.getByText('This expedition is too large for QR exchange. Use the exchange file instead.', {
      exact: true,
    }),
  ).toBeVisible()
  expect(JSON.parse(downloaded.toString()).heads).toBe(JSON.parse(buffer.toString()).heads)
  await page.getByRole('button', { name: 'Receive updates', exact: true }).click()
  const corrupted = { ...JSON.parse(buffer.toString()), sha256: '0'.repeat(64) }
  await page.getByLabel('Import exchange file', { exact: false }).setInputFiles({
    name: 'corrupt.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(corrupted)),
  })
  await expect(page.getByRole('alert')).toContainText('integrity check failed')
  await page.getByRole('button', { name: /Field log/ }).click()
  await expect(page.locator('article')).toHaveCount(300)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Checkpoint board', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('a simulated storage quota failure preserves the form and retry saves literal hostile-looking text safely', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (this.name === 'workspaces' && sessionStorage.getItem('test-fail-next-write') === 'yes') {
        sessionStorage.removeItem('test-fail-next-write')
        throw new DOMException('Synthetic storage quota exceeded', 'QuotaExceededError')
      }
      return original.apply(this, args)
    }
  })
  await setup(page, 'Quota test')
  await page.getByLabel('Expedition name', { exact: true }).fill('Failure recovery')
  await page.getByRole('button', { name: 'Create expedition', exact: true }).click()
  await page.getByRole('button', { name: /Add field record/ }).click()
  const title = '<img src=x onerror=alert(1)> · हिमालय'
  await page.getByLabel('Title', { exact: true }).fill(title)
  await page.getByLabel('Field notes', { exact: true }).fill('<script>window.pwned=true</script>')
  await page.evaluate(() => sessionStorage.setItem('test-fail-next-write', 'yes'))
  await page.getByRole('button', { name: 'Save field record', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Synthetic storage quota exceeded')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title)
  await page.getByRole('button', { name: 'Save field record', exact: true }).click()
  await expect(page.locator('article')).toHaveCount(1)
  await expect(page.locator('article h3')).toHaveText(title)
  expect(await page.locator('article img, article script').count()).toBe(0)
  await page.reload()
  await expect(page.locator('article h3')).toHaveText(title)
})

async function setup(page: Page, deviceName: string) {
  await page.goto('/')
  await page.getByRole('button', { name: /Field log/ }).click()
  await page.getByLabel('Device name', { exact: true }).fill(deviceName)
  await page.getByRole('button', { name: 'Save device name', exact: true }).click()
  await expect(page.getByText('Device name saved.')).toBeVisible()
  await expect(page.locator('.sidebar-status')).toContainText('Ready for offline use')
}

test('another tab invalidates an outgoing snapshot until it is refreshed', async ({
  page,
  context,
}) => {
  await setup(page, 'Two tabs')
  await page.getByLabel('Expedition name', { exact: true }).fill('Shared browser')
  await page.getByRole('button', { name: 'Create expedition', exact: true }).click()
  await newRecord(page, 'Original')
  await outgoing(page)
  const other = await context.newPage()
  await other.goto('/')
  await newRecord(other, 'Written in another tab')
  await expect(
    page.getByText('Your expedition changed. Refresh the snapshot before sending.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Download exchange file', exact: true }),
  ).toBeDisabled()
  await expect(page.getByRole('img', { name: /BlackOut transfer frame/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Refresh outgoing snapshot', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Download exchange file', exact: true }),
  ).toBeEnabled()
  await expect(page.getByRole('img', { name: /BlackOut transfer frame/ })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/release-exchange-desktop.png', fullPage: true })
  await other.close()
})

test('a failed QR-frame write does not advance progress and the same frame can be retried', async ({
  browser,
}) => {
  const ca = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  const cb = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  await cb.addInitScript(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (this.name === 'receiver' && sessionStorage.getItem('test-fail-frame') === 'yes') {
        sessionStorage.removeItem('test-fail-frame')
        throw new DOMException('Synthetic frame storage failure', 'QuotaExceededError')
      }
      return original.apply(this, args)
    }
  })
  const a = await ca.newPage(),
    b = await cb.newPage()
  await setup(a, 'Sender')
  await setup(b, 'Receiver')
  await a.getByLabel('Expedition name', { exact: true }).fill('Frame retry')
  await a.getByRole('button', { name: 'Create expedition', exact: true }).click()
  await newRecord(a, 'Preserved frame')
  await outgoing(a)
  await a.getByText('Manual transfer fallback', { exact: true }).click()
  const frame = await a.getByLabel('Outgoing QR frame', { exact: true }).inputValue()
  await b.getByRole('button', { name: /Exchange updates/ }).click()
  await b.getByText('Manual transfer fallback', { exact: true }).click()
  await b.evaluate(() => sessionStorage.setItem('test-fail-frame', 'yes'))
  await b.getByLabel('Paste one BlackOut QR frame', { exact: true }).fill(frame)
  await b.getByRole('button', { name: 'Receive pasted frame', exact: true }).click()
  await expect(b.getByRole('alert')).toContainText('Synthetic frame storage failure')
  await expect(b.locator('.transfer-progress')).toHaveCount(0)
  await b.getByLabel('Paste one BlackOut QR frame', { exact: true }).fill(frame)
  await b.getByRole('button', { name: 'Receive pasted frame', exact: true }).click()
  await expect(b.locator('.transfer-progress')).toContainText('1 /')
  await b.reload()
  await b.getByRole('button', { name: /Exchange updates/ }).click()
  await expect(b.locator('.transfer-progress')).toContainText('1 /')
  await ca.close()
  await cb.close()
})

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
  await expect(bob.locator('.merge-reveal-grid strong')).toHaveText(['1', '1', '1'])
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
  await expect(bob.locator('.merge-reveal-grid strong')).toHaveText(['0', '0', '0'])
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
  await page.getByRole('button', { name: /Field log/ }).click()
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
