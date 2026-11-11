import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mainnet } from '@filoz/synapse-sdk'
import { decodeFunctionData, encodeFunctionResult, toFunctionSelector } from 'viem'
import { prepareBrowserPage } from './drive-browser-fixtures.mjs'
import { openDrive } from './drive-browser-navigation.mjs'

/** Exercise the real task UI/persistence and SDK recovery readers without submitting transactions. */
export async function checkUploadTasks(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true })
  const folderFixture = await mkdtemp(join(tmpdir(), 'drive-folder-browser-'))
  try {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareBrowserPage(page, { seedDirectory: false })
    const providers = `const contexts = () => [4n,5n].map(id => ({provider:{id,name:'SP '+id,pdp:{serviceURL:'https://sp'+id+'.example'}},dataSetId:id+10n}));`
    await page.route('**/src/lib/filecoin-pin/fresh-contexts.ts*', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `${providers} export async function createFreshUploadContexts(){ return contexts() }`,
      })
    )
    await page.route('**/src/lib/filecoin-pin/upload-funding.ts*', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `${providers} export class UploadFundingRequired extends Error {} export const formatFundingAmount = amount => String(Number(amount)/1e18); export async function resolveUploadContexts(){return contexts()} export async function prepareUploadContexts(_synapse,_size,options){ return options.contexts ?? contexts() }`,
      })
    )
    await page.route('**/node_modules/.vite/deps/filecoin-pin_core_upload.js*', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `
      import {calculate} from '/node_modules/.vite/deps/@filoz_synapse-core_piece.js';
      export async function checkUploadReadiness(){return {status:'ready'}}
      export async function executeUpload(_synapse,bytes,root,options){
        const pieceCid=await calculate(bytes);
        const label=options.pieceMetadata.label;
        const name=label.endsWith('/')?label.slice(0,-1):label;
        const emit=options.onProgress;
        emit({type:'stored',data:{providerId:4n,pieceCid}});
        const hash=id=>'0x'+String(id).repeat(64);
        if(name !== 'interrupted.txt') {
          emit({type:'piecesAdded',data:{providerId:4n,txHash:hash(1)}});
          emit({type:'piecesAdded',data:{providerId:5n,txHash:hash(2)}});
        }
        return new Promise(resolve=>{
          window.__taskUploads ??={};
          window.__taskUploads[name]={bytes:Array.from(bytes),pieceCid:pieceCid.toString(),confirmPrimary(){
            emit({type:'piecesConfirmed',data:{providerId:4n,dataSetId:14n,pieceIds:[8n]}});
          },finish(){
            emit({type:'piecesConfirmed',data:{providerId:4n,dataSetId:14n,pieceIds:[8n]}});
            emit({type:'piecesConfirmed',data:{providerId:5n,dataSetId:15n,pieceIds:[9n]}});
            emit({type:'ipniProviderResults:complete',data:{}});
            resolve({pieceCid,copies:[{role:'primary',providerId:4n,dataSetId:14n,pieceId:8n},{role:'secondary',providerId:5n,dataSetId:15n,pieceId:9n}],requestedCopies:2});
          }};
        });
      }
    `,
      })
    )
    const findAbi = mainnet.contracts.pdp.abi.find(
      (item) => item.type === 'function' && item.name === 'findPieceIdsByCid'
    )
    await page.route('**/rpc/v1', async (route) => {
      const request = route.request().postDataJSON()
      const data = request?.params?.[0]?.data
      if (request?.method !== 'eth_call' || !data?.startsWith(toFunctionSelector(findAbi))) return route.fallback()
      const { args } = decodeFunctionData({ abi: mainnet.contracts.pdp.abi, data })
      const result = encodeFunctionResult({
        abi: mainnet.contracts.pdp.abi,
        functionName: 'findPieceIdsByCid',
        result: [args[0] === 14n ? 8n : 9n],
      })
      return route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ jsonrpc: '2.0', id: request.id, result }),
      })
    })
    await page.route('https://sp*.example/**', async (route) => {
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({
          status: 204,
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        })
      const url = new URL(route.request().url())
      if (url.pathname.startsWith('/piece/')) {
        const bytes = await page.evaluate(
          (cid) => Object.values(window.__taskUploads).find((upload) => upload.pieceCid === cid)?.bytes,
          url.pathname.slice('/piece/'.length)
        )
        return route.fulfill({
          contentType: 'application/vnd.ipld.car',
          headers: { 'access-control-allow-origin': '*' },
          body: Buffer.from(bytes),
        })
      }
      const dataset = url.pathname.includes('/14/') ? 14 : 15
      return route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          txHash: `0x${'1'.repeat(64)}`,
          txStatus: 'confirmed',
          dataSetId: dataset,
          pieceCount: 2,
          addMessageOk: true,
          piecesAdded: true,
          confirmedPieceIds: [7, dataset === 14 ? 8 : 9],
        }),
      })
    })
    await page.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
    await openDrive(page)
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
    await page.getByRole('button', { name: 'Wallet and Storage', exact: true }).click()
    await page
      .getByRole('checkbox', { name: 'I authorize storage uploads and file deletions for this browser.' })
      .check()
    await page.getByRole('button', { name: 'Authorize session', exact: true }).click()
    await page.getByLabel('Session authorized', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Close Wallet and Storage', exact: true }).click()
    const start = async (name) => {
      await page.getByRole('button', { name: 'Upload files', exact: true }).click()
      const panel = page.getByRole('dialog', { name: 'Upload files', exact: true })
      await panel
        .locator('input[type=file]')
        .setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(`${name} original bytes`) })
      await panel.getByRole('button', { name: 'Upload', exact: true }).click()
      await page.getByRole('button', { name, exact: true }).waitFor()
      await page
        .waitForFunction((name) => Boolean(window.__taskUploads?.[name]), name)
        .catch(async (error) => {
          console.log(await page.locator('body').innerText())
          console.log(errors)
          console.log(
            await page.evaluate(() =>
              localStorage.getItem('filecoin-pin-piece-cache-v1-314:0x1111111111111111111111111111111111111111')
            )
          )
          throw error
        })
      await page.getByRole('button', { name: 'Upload files', exact: true }).waitFor({ state: 'visible' })
      await page.waitForFunction(() => !document.querySelector('button[aria-label="Upload files"]').disabled)
    }
    await start('first.txt')
    const firstRow = page.getByRole('button', { name: 'first.txt', exact: true }).locator('..').locator('..')
    await firstRow.getByLabel('Uploading…').waitFor()
    assert.equal(await firstRow.getByRole('button', { name: 'Share', exact: true }).isDisabled(), true)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      firstRow.getByRole('button', { name: 'Download', exact: true }).click(),
    ])
    assert.equal(download.suggestedFilename(), 'first.txt')
    await start('second.txt')
    await page.evaluate(() => window.__taskUploads['second.txt'].finish())
    const secondRow = page.getByRole('button', { name: 'second.txt', exact: true }).locator('..').locator('..')
    await secondRow.getByLabel('Uploading…').waitFor({ state: 'detached' })
    await secondRow.locator('button:not([disabled])', { hasText: 'Share' }).waitFor()
    await firstRow.getByLabel('Uploading…').waitFor()
    await page.evaluate(() => window.__taskUploads['first.txt'].confirmPrimary())
    await firstRow.getByLabel('Uploading…').waitFor({ state: 'detached' })
    assert.equal(await firstRow.getByText(/confirmed/).count(), 0, 'Replication counts must stay out of the list')
    assert.equal(await firstRow.getByText('Stored', { exact: true }).count(), 0, 'Stored must not render as a badge')
    await page.screenshot({ path: '/tmp/drive-partial-copy-status.png', fullPage: true })
    assert.equal(await page.getByRole('complementary', { name: 'Upload activity' }).count(), 0)
    await page.getByRole('button', { name: 'first.txt', exact: true }).click()
    const details = page.getByRole('dialog', { name: 'first.txt', exact: true })
    assert.equal(await details.getByRole('button', { name: 'Remove from list', exact: true }).count(), 0)
    assert.equal(
      await details
        .locator('details')
        .filter({ has: page.getByText('Upload details', { exact: true }) })
        .getAttribute('open'),
      null
    )
    await page.screenshot({ path: '/tmp/drive-per-file-upload-details.png', fullPage: true })
    await page.getByRole('button', { name: 'Close details', exact: true }).click()
    await page.reload()
    await page.getByRole('button', { name: 'first.txt', exact: true }).click()
    await page.getByRole('button', { name: 'Check status', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'first.txt', exact: true })
      .getByText('Stored', { exact: false })
      .first()
      .waitFor({ timeout: 20000 })
    await page.waitForFunction(
      () =>
        JSON.parse(
          localStorage.getItem('filecoin-pin-piece-cache-v1-314:0x1111111111111111111111111111111111111111')
        ).find((file) => file.fileName === 'first.txt').upload.phase === 'complete'
    )
    const files = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('filecoin-pin-piece-cache-v1-314:0x1111111111111111111111111111111111111111'))
    )
    assert.equal(files.length, 2)
    assert.deepEqual(files.find((file) => file.fileName === 'first.txt').pieceIds, ['8', '9'])
    await page.getByRole('button', { name: 'Close details', exact: true }).click()
    await start('interrupted.txt')
    await page.reload()
    await page.getByRole('button', { name: 'interrupted.txt', exact: true }).click()
    const interrupted = page.getByRole('dialog', { name: 'interrupted.txt', exact: true })
    await interrupted.getByRole('button', { name: 'Check status', exact: true }).click()
    await interrupted.getByText('Upload failed', { exact: true }).waitFor()
    assert.equal(await interrupted.getByText(/Background upload work has stopped/).isVisible(), false)
    assert.equal(
      await interrupted.getByText('File transfer · Received by provider', { exact: true }).isVisible(),
      false
    )
    const interruptedRow = page
      .getByRole('button', { name: 'interrupted.txt', exact: true, includeHidden: true })
      .locator('..')
      .locator('..')
    await interruptedRow.getByText('Upload failed', { exact: true }).waitFor()
    assert.equal(await interruptedRow.getByText('Interrupted', { exact: true }).count(), 0)
    assert.equal(await interruptedRow.getByText(/confirmed/).count(), 0, 'Replication counts must stay out of the list')
    await page.screenshot({ path: '/tmp/drive-upload-status-interrupted-collapsed.png', fullPage: true })

    await interrupted.getByText('Upload details', { exact: true }).click()
    await interrupted.getByText(/Background upload work has stopped/).waitFor()
    await interrupted.getByText('File transfer · Received by provider', { exact: true }).waitFor()
    await interrupted
      .getByText('Provider 4 · File received; submission receipt not recorded', { exact: true })
      .waitFor()
    assert.equal(await interrupted.getByText('In progress', { exact: true }).count(), 0)
    await interrupted.getByText('Not verified', { exact: true }).first().waitFor()
    await page.screenshot({ path: '/tmp/drive-interrupted-upload.png', fullPage: true })
    await interrupted.getByRole('button', { name: 'Remove from list', exact: true }).click()
    await interrupted.waitFor({ state: 'hidden' })
    assert.equal(await page.getByRole('button', { name: 'interrupted.txt', exact: true }).count(), 0)
    await page.reload()
    await page.getByRole('button', { name: 'first.txt', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'interrupted.txt', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'second.txt', exact: true }).count(), 1)
    const folderPath = join(folderFixture, 'reports')
    await mkdir(join(folderPath, 'docs'), { recursive: true })
    await writeFile(join(folderPath, '研究.txt'), 'hello folder')
    await writeFile(join(folderPath, 'docs', 'notes.txt'), 'nested notes')
    await page.waitForFunction(
      () => document.querySelector('section[aria-label="Files list"]')?.getAttribute('aria-busy') === 'false'
    )
    await page.getByRole('button', { name: 'Upload files', exact: true }).click()
    const folderPanel = page.getByRole('dialog', { name: 'Upload files', exact: true })
    await folderPanel.getByText('Choose files', { exact: true }).waitFor()
    const fileUploadButton = await folderPanel.getByRole('button', { name: 'Upload', exact: true }).boundingBox()
    await page.screenshot({ path: '/tmp/drive-file-upload-empty.png', fullPage: true, animations: 'disabled' })
    await folderPanel.getByRole('button', { name: 'Folder', exact: true }).click()
    const folderUploadButton = await folderPanel.getByRole('button', { name: 'Upload', exact: true }).boundingBox()
    assert.equal(fileUploadButton.x, folderUploadButton.x, 'Upload buttons should share their horizontal position')
    assert.equal(fileUploadButton.y, folderUploadButton.y, 'Switching upload type should not move the actions')
    await page.screenshot({ path: '/tmp/drive-folder-upload-empty.png', fullPage: true, animations: 'disabled' })
    await folderPanel.getByLabel('Select folder to upload').setInputFiles(folderPath)
    await folderPanel.getByText('reports', { exact: true }).waitFor()
    await page.screenshot({ path: '/tmp/drive-folder-upload-picker.png', fullPage: true, animations: 'disabled' })
    await page.evaluate(() => {
      const key = 'filecoin-pin-piece-cache-v1-314:0x1111111111111111111111111111111111111111'
      const files = JSON.parse(localStorage.getItem(key))
      const previous = files[0]
      files.push({
        ...previous,
        id: 'deleted-folder',
        fileName: 'reports',
        isDirectory: true,
        removedCopies: previous.datasetIds ?? [previous.datasetId],
      })
      localStorage.setItem(key, JSON.stringify(files))
    })
    await folderPanel.getByRole('button', { name: 'Upload', exact: true }).click()
    await page.waitForFunction(() => Boolean(window.__taskUploads?.reports))
    const folderRow = page
      .getByRole('row')
      .filter({ hasText: 'reports' })
      .filter({ has: page.getByRole('button', { name: 'Download ZIP', exact: true }) })
    await folderRow.getByRole('button', { name: 'reports', exact: true }).click()
    await page.getByRole('dialog', { name: 'reports', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Unlock and identify', exact: true }).count(), 0)
    assert.equal(
      await page
        .getByRole('navigation', { name: 'File folders', exact: true })
        .getByRole('button', { name: 'reports', exact: true })
        .count(),
      0
    )
    await page.getByRole('button', { name: 'Close details', exact: true }).click()
    await page.evaluate(() => window.__taskUploads.reports.finish())
    await page.waitForFunction(
      () =>
        JSON.parse(
          localStorage.getItem('filecoin-pin-piece-cache-v1-314:0x1111111111111111111111111111111111111111')
        ).find((file) => file.fileName === 'reports' && !file.removedCopies?.length).upload.phase === 'complete'
    )
    assert.deepEqual(errors, [])
    console.log(
      'Upload task browser checks passed: parked download, consecutive uploads, per-file details and reload recovery.'
    )
  } finally {
    await context.close()
    await rm(folderFixture, { recursive: true, force: true })
  }
}
