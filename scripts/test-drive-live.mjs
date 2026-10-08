import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { calibration } from '@filoz/synapse-sdk'
import { chromium } from 'playwright'
import { createPublicClient, createWalletClient, erc20Abi, formatEther, http, parseEther } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

// Calibration only. Never import an existing personal wallet into this harness.
const keyPath = new URL('../.drive-calibration-wallet.local', import.meta.url)
let privateKey
try {
  privateKey = JSON.parse(await readFile(keyPath, 'utf8')).privateKey
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  privateKey = generatePrivateKey()
  await writeFile(keyPath, JSON.stringify({ privateKey }), { mode: 0o600, flag: 'wx' })
}
const account = privateKeyToAccount(privateKey)
const reader = createPublicClient({ chain: calibration, transport: http() })
const signer = createWalletClient({ account, chain: calibration, transport: http() })
const [fil, usdfc] = await Promise.all([
  reader.getBalance({ address: account.address }),
  reader.readContract({
    address: calibration.contracts.usdfc.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  }),
])
console.log(
  JSON.stringify({ network: 'Calibration', address: account.address, FIL: formatEther(fil), USDFC: formatEther(usdfc) })
)
const authorizationOnly = process.argv.includes('--authorize-only')
if (!process.argv.includes('--run') && !authorizationOnly) process.exit(0)
assert(
  fil >= parseEther('0.2') && (authorizationOnly || usdfc >= parseEther('1')),
  'Fund this isolated Calibration test wallet with test FIL and at least 1 test USDFC first.'
)

async function walletRequest({ method, params = [] }) {
  if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account.address]
  if (method === 'eth_chainId') return '0x4cb2f'
  if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
    assert.equal(Number(params[0].chainId), calibration.id, 'Live test refuses every other network')
    return null
  }
  if (method === 'eth_sendTransaction') {
    const { from, to, data, value, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, chainId } = params[0]
    assert.equal(from.toLowerCase(), account.address.toLowerCase())
    if (chainId !== undefined) assert.equal(Number(chainId), calibration.id)
    const transaction = { to, data }
    for (const [name, raw] of Object.entries({ value, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas }))
      if (raw !== undefined) transaction[name] = BigInt(raw)
    const hash = await signer.sendTransaction(transaction)
    console.log(`Calibration owner transaction: ${hash}`)
    return hash
  }
  if (method === 'eth_signTypedData_v4') {
    assert.equal(params[0].toLowerCase(), account.address.toLowerCase())
    const typed = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1]
    assert.equal(Number(typed.domain.chainId), calibration.id)
    return signer.signTypedData(typed)
  }
  if (method === 'personal_sign') return signer.signMessage({ message: { raw: params[0] } })
  return reader.request({ method, params })
}

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
const appUrl = process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/'
const scope = `${calibration.id}:${account.address.toLowerCase()}`
let primaryPage
const progressTimer = setInterval(() => {
  if (!primaryPage || primaryPage.isClosed()) return
  void primaryPage
    .locator('body')
    .innerText()
    .then((body) => {
      const current = body.match(/Current upload[\s\S]*?(?=\nFiles\n|$)/)?.[0]
      console.log(`Live progress: ${current?.slice(0, 1200) || 'Waiting for wallet setup'}`)
    })
    .catch(() => undefined)
}, 30000)
async function newWalletPage() {
  const page = await browser.newPage()
  page.setDefaultTimeout(180_000)
  page.on('pageerror', (error) => console.error(`Browser error: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`Browser console: ${message.text()}`)
  })
  await page.exposeFunction('__liveWalletRequest', walletRequest)
  await page.addInitScript(() => {
    window.ethereum = {
      request: (request) => window.__liveWalletRequest(request),
      on: () => undefined,
      removeListener: () => undefined,
    }
  })
  await page.goto(appUrl)
  await page.getByLabel('Network', { exact: true }).selectOption('calibration')
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  return page
}
try {
  const page = await newWalletPage()
  primaryPage = page
  await page.getByRole('button', { name: 'Wallet & storage', exact: true }).click()
  await page
    .getByRole('checkbox', { name: 'I authorize all four storage permissions, including deletion, for this browser.' })
    .check()
  await page.getByRole('button', { name: 'Authorize session', exact: true }).click()
  await page.getByText('Wallet setup · Session authorized', { exact: true }).waitFor()
  if (authorizationOnly) {
    await page.reload()
    await page.getByLabel('Network', { exact: true }).selectOption('calibration')
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
    await page.getByRole('button', { name: 'Wallet & storage', exact: true }).click()
    await page.getByText('Wallet setup · Session authorized', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Revoke session', exact: true }).click()
    await page.getByRole('button', { name: 'Authorize session', exact: true }).waitFor()
    console.log('Real session authorization, encrypted reload recovery and revocation verified')
  } else {
    const additionalDeposit = process.env.DRIVE_TEST_DEPOSIT
    if (additionalDeposit) {
      const input = page.getByLabel('Deposit amount in USDFC', { exact: true })
      if (!(await input.isVisible())) await page.getByRole('button', { name: 'Wallet & storage', exact: true }).click()
      await input.fill(additionalDeposit)
      await page.getByRole('button', { name: 'Deposit USDFC', exact: true }).click()
      await page.getByText('Deposit confirmed.', { exact: true }).waitFor()
      await page.waitForFunction(() =>
        [...document.querySelectorAll('button')].some(
          (button) => button.textContent.trim() === 'Deposit USDFC' && !button.disabled
        )
      )
      console.log(`Additional ${additionalDeposit} test USDFC deposited`)
    }
    if (await page.getByText('Session ready', { exact: true }).count()) {
      console.log('Existing deposited funds and payment approval are ready')
    } else {
      await page.getByLabel('Deposit amount in USDFC', { exact: true }).fill('1')
      await page.getByRole('button', { name: 'Deposit USDFC', exact: true }).click()
      await page.getByRole('button', { name: 'Deposit USDFC', exact: true }).waitFor({ state: 'visible' })
      await page
        .getByRole('checkbox', {
          name: 'Allow Warm Storage to manage payment rails with unlimited rate and lockup allowances.',
        })
        .check()
      await page.getByRole('button', { name: 'Approve storage payments', exact: true }).click()
      await page.getByText('Session ready', { exact: true }).waitFor()
    }
    await page.getByRole('button', { name: 'Close Wallet & storage', exact: true }).click()
    if (process.env.DRIVE_TEST_IMPORT_DIRECTORY) {
      await page.getByText('Session ready', { exact: true }).waitFor()
      await page.getByLabel('Import directory').setInputFiles(process.env.DRIVE_TEST_IMPORT_DIRECTORY)
      console.log('Existing directory imported for dataset reuse acceptance')
    }
    console.log('Owner session authorized; storage funding and payment approval ready')
    const bytes = Buffer.from(Array.from({ length: 256 * 1024 + 123 }, (_, index) => index % 251))
    const fileName = process.env.DRIVE_TEST_EXISTING_FILE || `验收-${Date.now()}.bin`
    if (!process.env.DRIVE_TEST_EXISTING_FILE) {
      await page.getByRole('button', { name: 'Upload files', exact: true }).click()
      await page
        .locator('form input[type=file]')
        .setInputFiles({ name: fileName, mimeType: 'application/octet-stream', buffer: bytes })
      await page.getByRole('button', { name: 'Upload', exact: true }).click()
      console.log('File upload submitted')
      const uploadResult = await Promise.race([
        page
          .getByRole('button', { name: fileName, exact: true })
          .waitFor({ timeout: 600_000 })
          .then(() => 'stored'),
        page
          .getByRole('complementary', { name: 'Upload activity', exact: true })
          .getByText('Upload failed', { exact: true })
          .waitFor({ timeout: 600_000 })
          .then(() => 'failed'),
      ])
      assert.equal(uploadResult, 'stored', 'File upload failed; see browser error and saved directory')
    }
    if (await page.getByRole('button', { name: 'Close Upload details', exact: true }).count())
      await page.getByRole('button', { name: 'Close Upload details', exact: true }).click()
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some(
          (button) => button.textContent.trim() === 'Download' && !button.disabled
        ),
      undefined,
      { timeout: 600_000 }
    )
    const [downloaded] = await Promise.all([
      page.waitForEvent('download', { timeout: 300_000 }),
      page
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: fileName, exact: true }) })
        .getByRole('button', { name: 'Download', exact: true })
        .click({ timeout: 600_000 }),
    ])
    assert.equal(Buffer.compare(await readFile(await downloaded.path()), bytes), 0)
    if (process.env.DRIVE_TEST_IMPORT_DIRECTORY) {
      const imported = JSON.parse(await readFile(process.env.DRIVE_TEST_IMPORT_DIRECTORY, 'utf8'))
      const originalIds = new Set(imported.files.flatMap((file) => file.datasetIds || [file.datasetId]))
      const currentIds = await page.evaluate(
        ({ scope, fileName }) => {
          const file = JSON.parse(localStorage.getItem(`filecoin-pin-piece-cache-v1-${scope}`) || '[]').find(
            (file) => file.fileName === fileName
          )
          return file.datasetIds || [file.datasetId]
        },
        { scope, fileName }
      )
      assert(
        currentIds.length && currentIds.every((id) => originalIds.has(id)),
        'Upload did not reuse imported datasets'
      )
      console.log(`Existing datasets reused: ${currentIds.join(', ')}`)
    }
    console.log('Real provider upload and original-file retrieval verified')
    const exportedDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export directory', exact: true }).click()
    const exported = await exportedDownload
    const backupPath = await exported.path()
    const restoredPage = await newWalletPage()
    await restoredPage.getByLabel('Import directory').setInputFiles(backupPath)
    await restoredPage.getByRole('button', { name: fileName, exact: true }).waitFor()
    const [restoredDownload] = await Promise.all([
      restoredPage.waitForEvent('download', { timeout: 300_000 }),
      restoredPage
        .getByRole('row')
        .filter({ has: restoredPage.getByRole('button', { name: fileName, exact: true }) })
        .getByRole('button', { name: 'Download', exact: true })
        .click(),
    ])
    assert.equal(Buffer.compare(await readFile(await restoredDownload.path()), bytes), 0)
    assert.equal(await restoredPage.getByRole('button', { name: 'Renew authorization', exact: true }).count(), 0)
    console.log('Independent browser directory restore and retrieval verified without transferring the session key')
    await page.getByRole('button', { name: fileName, exact: true }).click()
    await page.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }).check()
    await page.getByRole('button', { name: /^(Schedule|Continue) deletion$/ }).click()
    await page.waitForFunction(
      (scope) => {
        const files = JSON.parse(localStorage.getItem(`filecoin-pin-piece-cache-v1-${scope}`) || '[]')
        return (
          files.length &&
          files.every((file) =>
            (file.datasetIds || [file.datasetId]).every(
              (id) => file.deletion?.[id]?.confirmed && !file.deletion[id].remaining
            )
          )
        )
      },
      scope,
      { timeout: 600_000 }
    )
    await page.getByRole('button', { name: 'Close details', exact: true }).click()
    await page.getByRole('button', { name: 'Wallet & storage', exact: true }).click()
    await page.getByRole('button', { name: 'Revoke session', exact: true }).click()
    await page.getByRole('button', { name: 'Authorize session', exact: true }).waitFor()
    console.log('All recorded copies scheduled for deletion; browser session revoked')
  }
} catch (error) {
  if (primaryPage && !primaryPage.isClosed()) {
    console.error(await primaryPage.locator('body').innerText())
    await primaryPage.screenshot({ path: '/tmp/filecoin-drive-live-failure.png', fullPage: true })
  }
  throw error
} finally {
  clearInterval(progressTimer)
  if (primaryPage && !primaryPage.isClosed()) {
    const directory = await primaryPage
      .evaluate(
        (scope) => ({
          version: 1,
          scope,
          exportedAt: Date.now(),
          files: JSON.parse(localStorage.getItem(`filecoin-pin-piece-cache-v1-${scope}`) || '[]'),
          folders: JSON.parse(localStorage.getItem(`filecoin-drive-folders-${scope}`) || '[]'),
        }),
        scope
      )
      .catch(() => null)
    if (directory)
      await writeFile(
        new URL('../.drive-calibration-directory.local', import.meta.url),
        JSON.stringify(directory, null, 2),
        { mode: 0o600 }
      )
  }
  await browser.close()
}
