import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { prepareBrowserPage } from './drive-browser-fixtures.mjs'
import { openDrive } from './drive-browser-navigation.mjs'

// Real UI with read-only quote fixtures; no wallet transaction is submitted.
const output = '/tmp/filecoin-funding-screenshots'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
try {
  for (const scenario of ['top-up', 'funded', 'approval', 'unavailable']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
    const page = await context.newPage()
    await prepareBrowserPage(page, {
      depositedBalance: scenario === 'top-up' ? '500000000000000000' : '5400000000000000000',
    })
    await page.route('**/src/lib/filecoin-pin/storage-budget.ts*', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `export async function quoteStorageBudget(_synapse,_scope,capacity,days){window.__budgetInputs={capacity,days};
        ${scenario === 'unavailable' ? "throw new Error('Quote service unavailable')" : `return {copies:2,costs:{rates:{perMonth:60000000000000000n},depositNeeded:${scenario === 'top-up' ? '645192894000747211n' : '0n'},needsFwssMaxApproval:${scenario === 'approval'}},account:{availableFunds:${scenario === 'top-up' ? '100000000000000000n' : '5000000000000000000n'},totalLockup:400000000000000000n}}`}
      }`,
      })
    )
    await page.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
    await openDrive(page)
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
    await page.getByRole('button', { name: 'Wallet and Storage', exact: true }).click()
    const depositInput = page.getByRole('spinbutton', { name: 'Deposit amount in USDFC' })
    const balances = page.locator('[data-setup-target="gas"]')
    await balances.getByRole('button', { name: 'Refresh balances', exact: true }).waitFor()
    const budget = page.getByRole('region', { name: 'Storage funds', exact: true })
    assert.equal(
      await budget.getByRole('spinbutton', { name: 'Deposit amount in USDFC' }).count(),
      1,
      'Budget and deposit should share the same card'
    )
    if (scenario === 'top-up') {
      await budget.locator('dl').getByText('0.6452 USDFC', { exact: true }).waitFor()
      await page.waitForFunction(
        () => document.querySelector('input[aria-label="Deposit amount in USDFC"]')?.value === '0.6452'
      )
      assert.equal(await page.getByRole('spinbutton', { name: 'Deposit amount in USDFC' }).inputValue(), '0.6452')
    } else if (scenario === 'unavailable') {
      await budget.getByRole('button', { name: 'Retry estimate' }).waitFor()
    } else {
      await budget.getByText('Your funds cover this budget', { exact: true }).waitFor()
      if (scenario === 'approval') await budget.getByText('Storage payment approval is required separately.').waitFor()
    }
    if (scenario !== 'top-up') {
      assert.equal(await depositInput.inputValue(), '')
      assert.equal(await page.getByRole('button', { name: 'Deposit USDFC', exact: true }).isDisabled(), true)
    }
    assert.equal(await budget.getByRole('button', { name: 'Use suggested amount' }).count(), 0)
    if (scenario !== 'unavailable') await budget.getByText('0.06', { exact: true }).waitFor()
    const payments = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Storage payments', exact: true }) })
      .last()
    await page
      .locator('[data-setup-target="deposit"]')
      .screenshot({ path: `${output}/${scenario}-deposit.png`, animations: 'disabled' })
    await balances.screenshot({
      path: `${output}/${scenario}-balances.png`,
      animations: 'disabled',
      style: '[role="dialog"] > .sticky { position: static !important; }',
    })
    await payments.screenshot({
      path: `${output}/${scenario}-payments.png`,
      animations: 'disabled',
      style: '[role="dialog"] > .sticky { position: static !important; }',
    })
    await budget.scrollIntoViewIfNeeded()
    await budget.screenshot({ path: `${output}/${scenario}.png`, animations: 'disabled' })
    if (scenario === 'top-up') {
      await page.setViewportSize({ width: 390, height: 844 })
      await budget.scrollIntoViewIfNeeded()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await budget.screenshot({ path: `${output}/top-up-mobile.png`, animations: 'disabled' })
    }
    if (scenario === 'top-up') {
      await depositInput.fill('2')
      await budget.getByRole('spinbutton', { name: 'Storage budget in days' }).fill('31')
      await page.waitForFunction(() => window.__budgetInputs?.days === '31')
      assert.equal(await depositInput.inputValue(), '2', 'Manual amount should survive quote refresh')
    }
    if (scenario === 'funded') {
      await budget.getByRole('spinbutton', { name: 'Expected storage in GiB' }).fill('10240000')
      await budget.getByRole('spinbutton', { name: 'Storage budget in days' }).fill('730')
      await page.waitForFunction(
        () => window.__budgetInputs?.capacity === '10240000' && window.__budgetInputs?.days === '730'
      )
    }
    await context.close()
    console.log(`Funding ${scenario}: passed`)
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await context.newPage()
  await prepareBrowserPage(page, { seedDirectory: false })
  await page.route('**/src/lib/filecoin-pin/upload-funding.ts*', async (route) => {
    const response = await route.fetch()
    const body = (await response.text()).replace(
      'export async function prepareUploadContexts(',
      'async function originalPrepareUploadContexts('
    )
    await route.fulfill({
      response,
      body:
        body +
        `
      export async function prepareUploadContexts(){ throw new UploadFundingRequired(645192894000747211n, false, 2) }
    `,
    })
  })
  await page.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
  await openDrive(page)
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  await page.getByRole('button', { name: 'Wallet and Storage', exact: true }).click()
  await page.getByRole('checkbox', { name: 'I authorize storage uploads and file deletions for this browser.' }).check()
  await page.getByRole('button', { name: 'Authorize session', exact: true }).click()
  await page.getByLabel('Session authorized', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Close Wallet and Storage', exact: true }).click()
  await page.getByRole('button', { name: 'Upload files', exact: true }).click()
  const upload = page.getByRole('dialog', { name: 'Upload files', exact: true })
  await upload
    .locator('input[type=file]')
    .setInputFiles({ name: 'Zoom_Light.png', mimeType: 'image/png', buffer: Buffer.from('example file') })
  await upload.getByRole('button', { name: 'Upload', exact: true }).click()
  await page.getByText('Waiting for funding', { exact: true }).waitFor()
  await page.screenshot({ path: `${output}/waiting-list.png`, animations: 'disabled' })
  await page.getByRole('button', { name: 'Zoom_Light.png', exact: true }).click()
  await page.getByRole('button', { name: 'Check funding and continue', exact: true }).waitFor()
  await page.getByRole('dialog').screenshot({ path: `${output}/waiting-details.png`, animations: 'disabled' })
  await page.getByRole('button', { name: 'Add funds in Wallet and Storage', exact: true }).click()
  const walletPanel = page.getByRole('dialog', { name: 'Wallet and Storage', exact: true })
  await walletPanel.waitFor()
  assert.equal(await page.getByRole('dialog').count(), 1, 'File details must close when opening the wallet')
  const pending = page.getByRole('region', { name: 'Pending upload funding' })
  await pending.scrollIntoViewIfNeeded()
  await pending.screenshot({ path: `${output}/pending-wallet.png`, animations: 'disabled' })
  await page.getByRole('button', { name: 'Use upload minimum', exact: true }).click()
  assert.equal(await page.getByRole('spinbutton', { name: 'Deposit amount in USDFC' }).inputValue(), '0.6452')
  await page.getByRole('button', { name: 'Close Wallet and Storage', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Zoom_Light.png', exact: true }).click()
  await page
    .getByText('Select the original file again after funding; file bytes are not retained after leaving this page.', {
      exact: true,
    })
    .waitFor()
  await page.getByRole('dialog').screenshot({ path: `${output}/waiting-after-reload.png`, animations: 'disabled' })
  await context.close()
  console.log('Funding wait, retained file, and wallet navigation: passed')
} finally {
  await browser.close()
}
