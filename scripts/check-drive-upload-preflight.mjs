import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { prepareEncryptedBrowserPage } from './drive-browser-fixtures.mjs'
import { openDrive } from './drive-browser-navigation.mjs'

/** Keep the real SDK pricing/account reads; mock only providers and transfer. */
export async function checkUploadPreflight(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
  let releaseBalanceRead
  const balanceReadGate = new Promise((resolve) => {
    releaseBalanceRead = resolve
  })
  try {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareEncryptedBrowserPage(page, { seedDirectory: false })
    let holdBalanceRead = false
    let markBalanceRead
    const balanceReadStarted = new Promise((resolve) => {
      markBalanceRead = resolve
    })
    await page.route('**/rpc/v1', async (route) => {
      const body = route.request().postDataJSON()
      const requests = Array.isArray(body) ? body : [body]
      if (holdBalanceRead && requests.some((request) => request?.method === 'eth_getBalance')) {
        holdBalanceRead = false
        markBalanceRead()
        await balanceReadGate
      }
      return route.fallback()
    })
    await page.route('**/src/lib/filecoin-pin/fresh-contexts.ts*', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `export async function createFreshUploadContexts(){
          return [4n,5n].map(id=>({provider:{id,pdp:{serviceURL:'https://sp'+id+'.example'}},withCDN:false}));
        }`,
      })
    )
    await page.route('**/node_modules/.vite/deps/filecoin-pin_core_upload.js*', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `export async function executeUpload(){
          window.__preflightTransfers=(window.__preflightTransfers??0)+1;
          return new Promise(()=>{});
        }`,
      })
    )
    await page.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
    await openDrive(page)
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
    await page.getByRole('button', { name: 'Wallet and Storage', exact: true }).click()
    await page
      .getByRole('checkbox', { name: 'I authorize storage uploads and file deletions for this browser.' })
      .check()
    await page.getByRole('button', { name: 'Authorize session', exact: true }).click()
    await page.getByLabel('Session authorized', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Add encryption key', exact: true }).click()
    await page.getByLabel('Encryption key added', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Close Wallet and Storage', exact: true }).click()
    const walletButton = page.getByRole('button', { name: 'Wallet and Storage', exact: true, includeHidden: true })
    // A foreground refresh must warn before the user clicks either upload button.
    await page.evaluate(() => {
      window.__driveFunding.lockupCurrent = '9950000000000000000'
      window.__driveFunding.lockupRate = '30000000000000'
      window.__driveFunding.lockupLastSettledAt = '256'
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForFunction(
      () =>
        document.querySelector('button[aria-label="Wallet and Storage"]')?.getAttribute('aria-description') ===
        'Storage funds running low'
    )
    await walletButton.locator('.bg-warning').waitFor()
    assert.equal(await walletButton.locator('.bg-warning').count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Upload files', exact: true }).isDisabled(), true)
    if (process.env.DRIVE_TEST_SCREENSHOT_DIR) {
      await mkdir(process.env.DRIVE_TEST_SCREENSHOT_DIR, { recursive: true })
      await page.screenshot({
        path: join(process.env.DRIVE_TEST_SCREENSHOT_DIR, 'wallet-funds-warning.png'),
        animations: 'disabled',
      })
      await walletButton.screenshot({
        path: join(process.env.DRIVE_TEST_SCREENSHOT_DIR, 'wallet-funds-warning-button.png'),
        animations: 'disabled',
      })
    }
    await walletButton.click()
    await page.getByRole('heading', { name: 'Add funds to resume uploads', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Continue to upload', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Use 7-day minimum', exact: true }).count(), 0)
    assert.equal(await page.getByLabel('Storage budget in days', { exact: true }).inputValue(), '30')
    await page.waitForFunction(
      () => Number(document.querySelector('input[aria-label="Deposit amount in USDFC"]')?.value) > 2
    )
    if (process.env.DRIVE_TEST_SCREENSHOT_DIR) {
      await page.screenshot({
        path: join(process.env.DRIVE_TEST_SCREENSHOT_DIR, 'wallet-funds-warning-drawer.png'),
        animations: 'disabled',
      })
      await page.locator('section[aria-label="Next step"]').screenshot({
        path: join(process.env.DRIVE_TEST_SCREENSHOT_DIR, 'wallet-funds-warning-status.png'),
        animations: 'disabled',
      })
    }
    await page.getByRole('button', { name: 'Close Wallet and Storage', exact: true }).click()

    // Opening the drawer also rechecks an external withdrawal despite a positive total deposit.
    await page.evaluate(() => {
      window.__driveFunding.lockupCurrent = '10000000000000000000'
    })
    await walletButton.click()
    await page.getByLabel('Storage funds needed', { exact: true }).waitFor()
    await walletButton.locator('.bg-warning').waitFor()
    assert.equal(await walletButton.locator('.bg-warning').count(), 1)
    assert.equal(
      await page.getByRole('button', { name: 'Upload files', exact: true, includeHidden: true }).isDisabled(),
      true
    )
    await page.getByLabel('Storage payments approved', { exact: true }).waitFor()
    await page.evaluate(() => {
      window.__driveFunding.lockupCurrent = '0'
      window.__driveFunding.lockupRate = '0'
    })
    await page.getByRole('button', { name: 'Refresh balances', exact: true }).click()
    await page.getByLabel('Storage funds available', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Close Wallet and Storage', exact: true }).click()
    await walletButton.locator('.bg-success').waitFor()
    await page.getByRole('button', { name: 'Upload files', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Upload files', exact: true })
    await panel.locator('input[type=file]').setInputFiles({
      name: 'preflight.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Check funding before accepting this file.'),
    })
    const submit = panel.getByRole('button', { name: 'Upload', exact: true })
    const assertNoTasks = async () => {
      assert.equal(await panel.isVisible(), true, 'A failed preflight should preserve the file selection')
      assert.equal(await page.evaluate(() => window.__preflightTransfers ?? 0), 0)
      const records = await page.evaluate(() =>
        JSON.parse(localStorage.getItem(`filecoin-pin-piece-cache-v1-${window.__driveTestScope}`) || '[]')
      )
      assert.equal(records.length, 0, 'A failed preflight must not create paused or waiting records')
    }

    // The page still has a funded snapshot, but all deposited funds are now reserved.
    await page.evaluate(() => {
      window.__driveFunding.lockupCurrent = window.__driveFunding.depositedBalance ?? '10000000000000000000'
    })
    holdBalanceRead = true
    await submit.click()
    const checking = panel.getByRole('button', { name: 'Checking upload…', exact: true })
    await checking.waitFor()
    await balanceReadStarted
    assert.equal(await checking.isDisabled(), true, 'The pending check must disable repeat submissions')
    assert.equal(await checking.getAttribute('aria-busy'), 'true')
    assert.equal(await panel.getByLabel('Upload location', { exact: true }).isDisabled(), true)
    assert.equal(await panel.getByRole('button', { name: 'Folder', exact: true }).isDisabled(), true)
    await checking.evaluate((button) => {
      button.click()
      button.click()
    })
    await assertNoTasks()
    if (process.env.DRIVE_TEST_SCREENSHOT_DIR) {
      await mkdir(process.env.DRIVE_TEST_SCREENSHOT_DIR, { recursive: true })
      await page.screenshot({
        path: join(process.env.DRIVE_TEST_SCREENSHOT_DIR, 'upload-checking.png'),
        animations: 'disabled',
      })
    }
    releaseBalanceRead()
    await page.getByText(/Deposit at least .* more USDFC for these 2 storage copies/).waitFor()
    await assertNoTasks()
    assert.equal(await submit.isEnabled(), true, 'A failed check must restore the upload button')

    await page.evaluate(() => {
      window.__driveFunding.lockupCurrent = '0'
      window.__driveFunding.approved = false
    })
    await submit.click()
    await page.getByText('Approve storage payments in Wallet and Storage.', { exact: true }).waitFor()
    await assertNoTasks()

    await page.evaluate(() => {
      window.__driveFunding.approved = true
      window.__driveFunding.filBalance = '0'
    })
    await submit.click()
    await page.getByText(/Insufficient FIL for gas fees/).waitFor()
    await assertNoTasks()

    await page.evaluate(() => {
      delete window.__driveFunding.filBalance
      window.__driveAuthorized = false
    })
    await submit.click()
    await page.getByText('Upload session expired or was revoked. Authorize it again.', { exact: true }).waitFor()
    await assertNoTasks()

    // Retrying the same selection rechecks current state and still uses the final quote.
    await page.evaluate(() => {
      window.__driveAuthorized = true
    })
    await submit.click()
    await page.waitForFunction(() => window.__preflightTransfers === 1)
    await panel.waitFor({ state: 'hidden' })
    assert.deepEqual(errors, [])
    console.log(
      'Upload preflight passed: pending feedback, repeat submission guard, locked funds, revoked payment/session authorization, gas and funded retry.'
    )
  } finally {
    releaseBalanceRead()
    await context.close()
  }
}
