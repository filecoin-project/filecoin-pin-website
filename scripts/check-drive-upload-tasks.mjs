import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mainnet } from '@filoz/synapse-sdk'
import { CarReader } from '@ipld/car'
import { unzipSync } from 'fflate'
import { CID } from 'multiformats/cid'
import { decodeFunctionData, encodeFunctionResult, toFunctionSelector } from 'viem'
import { prepareBrowserPage } from './drive-browser-fixtures.mjs'

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
        body: `${providers} export async function prepareUploadContexts(_synapse,_size,options){ return options.contexts ?? contexts() }`,
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
        const name=options.pieceMetadata.label;
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
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
    await page.getByRole('button', { name: 'Wallet and storage', exact: true }).click()
    await page
      .getByRole('checkbox', { name: 'I authorize storage uploads and file deletions for this browser.' })
      .check()
    await page.getByRole('button', { name: 'Authorize session', exact: true }).click()
    await page.getByText('Wallet setup · Session authorized', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Close Wallet and storage', exact: true }).click()
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
    await firstRow.getByText('Confirming', { exact: true }).waitFor()
    assert.equal(await firstRow.getByRole('button', { name: 'Share', exact: true }).isDisabled(), true)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      firstRow.getByRole('button', { name: 'Download', exact: true }).click(),
    ])
    assert.equal(download.suggestedFilename(), 'first.txt')
    await start('second.txt')
    await page.evaluate(() => window.__taskUploads['second.txt'].finish())
    await page
      .getByRole('button', { name: 'second.txt', exact: true })
      .locator('..')
      .locator('..')
      .getByText('Stored', { exact: true })
      .waitFor()
    await firstRow.getByText('Confirming', { exact: true }).waitFor()
    await page.evaluate(() => window.__taskUploads['first.txt'].confirmPrimary())
    await firstRow.getByText('1 / 2 confirmed', { exact: true }).waitFor()
    await firstRow.getByText('Confirming', { exact: true }).waitFor()
    assert.equal(
      await firstRow.getByText(/^Stored/).evaluate((element) => element.classList.contains('text-success')),
      true
    )
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
    await interrupted.getByText('Upload interrupted', { exact: true }).waitFor()
    assert.equal(await interrupted.getByText(/Background upload work has stopped/).isVisible(), false)
    assert.equal(
      await interrupted.getByText('File transfer · Received by provider', { exact: true }).isVisible(),
      false
    )
    const interruptedRow = page
      .getByRole('button', { name: 'interrupted.txt', exact: true, includeHidden: true })
      .locator('..')
      .locator('..')
    await interruptedRow.getByText('Upload interrupted', { exact: true }).waitFor()
    assert.equal(await interruptedRow.getByText('Interrupted', { exact: true }).count(), 0)
    await interruptedRow.getByText('0 / 2 confirmed', { exact: true }).waitFor()
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
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent.trim() === 'Load from Filecoin' && !button.disabled
      )
    )
    const mainSearchBox = await page.getByRole('searchbox', { name: 'Search file list', exact: true }).boundingBox()
    await page.getByRole('button', { name: 'Upload files', exact: true }).click()
    const folderPanel = page.getByRole('dialog', { name: 'Upload files', exact: true })
    await folderPanel.getByText('Choose a file', { exact: true }).waitFor()
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
    const folderBytes = await page.evaluate(() => window.__taskUploads.reports.bytes)
    const folderCar = await CarReader.fromBytes(new Uint8Array(folderBytes))
    let rawRequests = 0
    let rawUnavailable = true
    await page.route('https://sp*.example/ipfs/**', async (route) => {
      rawRequests++
      if (rawUnavailable) return route.fulfill({ status: 503, body: 'Provider not ready' })
      const cid = new URL(route.request().url()).pathname.split('/')[2]
      const block = await folderCar.get(CID.parse(cid))
      return route.fulfill({
        status: block ? 200 : 404,
        contentType: 'application/vnd.ipld.raw',
        headers: { 'access-control-allow-origin': '*' },
        body: block ? Buffer.from(block.bytes) : '',
      })
    })
    const folderRow = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'reports', exact: true }) })
    await folderRow.waitFor()
    await page.getByRole('button', { name: 'About folder types', exact: true }).focus()
    await page.getByRole('tooltip').filter({ hasText: 'Uploaded as one unit' }).waitFor()
    await folderRow.getByRole('button', { name: 'reports', exact: true }).click()
    await page.getByRole('button', { name: 'docs', exact: true }).waitFor()
    const folderSearch = page.getByRole('searchbox', { name: 'Search this folder', exact: true })
    const directorySearchBox = await folderSearch.boundingBox()
    assert.equal(mainSearchBox.width, directorySearchBox.width, 'Directory search fields must share the same width')
    assert.equal(mainSearchBox.height, directorySearchBox.height, 'Directory search fields must share the same height')
    await folderSearch.fill('研究')
    await page.getByRole('row').filter({ hasText: '研究.txt' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'docs', exact: true }).count(), 0)
    await folderSearch.fill('no-such-file')
    await page.getByText('No matching files in this folder.', { exact: true }).waitFor()
    await folderSearch.fill('')
    await page.getByRole('button', { name: 'docs', exact: true }).waitFor()
    const zipAction = await page.getByRole('button', { name: 'Download ZIP', exact: true }).first().boundingBox()
    const shareAction = await page.getByRole('button', { name: 'Share', exact: true }).first().boundingBox()
    assert.equal(zipAction.y, shareAction.y, 'Directory actions should align in one row')
    assert.equal(zipAction.height, shareAction.height, 'Directory actions should have matching heights')
    assert.equal(zipAction.width, shareAction.width, 'Directory actions should have equal widths')
    const searchBox = await folderSearch.boundingBox()
    const uploadAction = await page.getByRole('button', { name: 'Upload files', exact: true }).boundingBox()
    assert.equal(searchBox.height, uploadAction.height, 'Search and global actions should have matching heights')
    assert.equal(searchBox.y, uploadAction.y, 'Search must remain beside Upload in either directory type')
    assert.equal(mainSearchBox.x, searchBox.x, 'Changing directory types must not move search')
    await folderSearch.evaluate((input) => input.blur())
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: '/tmp/drive-folder-mobile.png', fullPage: true, animations: 'disabled' })
    await page.setViewportSize({ width: 1440, height: 1080 })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.screenshot({ path: '/tmp/drive-folder-browse-root.png', fullPage: true, animations: 'disabled' })
    const [folderDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download ZIP', exact: true }).first().click(),
    ])
    assert.equal(folderDownload.suggestedFilename(), 'reports.zip')
    const stream = await folderDownload.createReadStream()
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const zip = unzipSync(new Uint8Array(Buffer.concat(chunks)))
    assert.equal(new TextDecoder().decode(zip['reports/研究.txt']), 'hello folder')
    assert.equal(new TextDecoder().decode(zip['reports/docs/notes.txt']), 'nested notes')
    await page.evaluate(() => window.__taskUploads.reports.finish())
    await page.waitForFunction(
      () =>
        JSON.parse(
          localStorage.getItem('filecoin-pin-piece-cache-v1-314:0x1111111111111111111111111111111111111111')
        ).find((file) => file.fileName === 'reports').upload.phase === 'complete'
    )
    await page.getByRole('button', { name: 'docs', exact: true }).click()
    const nestedRow = page.getByRole('row').filter({ hasText: 'notes.txt' })
    await nestedRow.getByRole('link', { name: 'Preview', exact: true }).waitFor()
    assert.match(
      await nestedRow.getByRole('link', { name: 'Preview', exact: true }).getAttribute('href'),
      /\.ipfs\.inbrowser\.link\/\?filename=notes.txt$/
    )
    assert.equal(rawRequests, 0, 'Fresh folder browsing must not require provider block reads')
    rawUnavailable = false
    const [childDownload] = await Promise.all([
      page.waitForEvent('download'),
      nestedRow.getByRole('button', { name: 'Download', exact: true }).click(),
    ])
    assert.equal(childDownload.suggestedFilename(), 'notes.txt')
    const [subfolderDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download ZIP', exact: true }).click(),
    ])
    assert.equal(subfolderDownload.suggestedFilename(), 'docs.zip')
    const subfolderZip = unzipSync(await readFile(await subfolderDownload.path()))
    assert.equal(new TextDecoder().decode(subfolderZip['docs/notes.txt']), 'nested notes')
    assert.equal(subfolderZip['reports/研究.txt'], undefined)
    await page.screenshot({ path: '/tmp/drive-folder-browse-nested.png', fullPage: true, animations: 'disabled' })
    await page
      .getByRole('navigation', { name: 'Current folder', exact: true })
      .getByRole('button', { name: 'Files', exact: true })
      .click()
    rawUnavailable = true
    await page.reload()
    const requestsBeforeReopen = rawRequests
    await page.getByRole('cell').getByRole('button', { name: 'reports', exact: true }).click()
    await page.getByRole('button', { name: 'docs', exact: true }).click()
    await page.getByRole('row').filter({ hasText: 'notes.txt' }).waitFor()
    assert.equal(rawRequests, requestsBeforeReopen, 'Reloaded folders must use IndexedDB despite provider outage')
    await page
      .getByRole('navigation', { name: 'Current folder', exact: true })
      .getByRole('button', { name: 'Files', exact: true })
      .click()
    await page.evaluate(() => {
      const key = 'filecoin-pin-piece-cache-v1-314:0x1111111111111111111111111111111111111111'
      const files = JSON.parse(localStorage.getItem(key))
      files.find((file) => file.fileName === 'first.txt').folderPath = 'testdir'
      localStorage.setItem(key, JSON.stringify(files))
    })
    await page.reload()
    const organizing = page.getByRole('cell').getByRole('button', { name: 'testdir', exact: true })
    const uploaded = page.getByRole('cell').getByRole('button', { name: 'reports', exact: true })
    await organizing.waitFor()
    const left = await organizing.locator('svg').boundingBox()
    const right = await uploaded.locator('svg').boundingBox()
    assert.equal(left.x, right.x, 'Folder icons must share the same left edge')
    await page.screenshot({ path: '/tmp/drive-folder-alignment.png', fullPage: true, animations: 'disabled' })
    await organizing.click()
    await page.getByRole('button', { name: 'Upload files', exact: true }).click()
    const uploadLocation = page.getByRole('textbox', { name: 'Upload location', exact: true })
    assert.equal(await uploadLocation.inputValue(), 'testdir')
    await page.getByRole('button', { name: 'Close Upload files', exact: true }).click()
    await page
      .getByRole('navigation', { name: 'File folders', exact: true })
      .getByRole('button', { name: 'reports', exact: true })
      .click()
    await page.getByRole('searchbox', { name: 'Search this folder', exact: true }).waitFor()
    const breadcrumbs = page.getByRole('navigation', { name: 'Current folder', exact: true })
    assert.equal((await breadcrumbs.innerText()).replace(/\s+/g, ' ').trim(), 'Files reports')
    await page
      .getByRole('region', { name: 'Files list', exact: true })
      .getByRole('button', { name: 'docs', exact: true })
      .click()
    await breadcrumbs.getByRole('button', { name: 'docs', exact: true }).waitFor()
    await breadcrumbs.getByRole('button', { name: 'reports', exact: true }).click()
    await page
      .getByRole('region', { name: 'Files list', exact: true })
      .getByRole('button', { name: 'docs', exact: true })
      .waitFor()
    await breadcrumbs.getByRole('button', { name: 'Files', exact: true }).click()
    await page.getByRole('cell').getByRole('button', { name: 'testdir', exact: true }).waitFor()
    assert.equal(
      (await breadcrumbs.innerText()).trim(),
      'Files',
      'Files breadcrumb must return to root, not the previously selected folder'
    )
    await page.getByRole('cell').getByRole('button', { name: 'reports', exact: true }).click()
    await page.getByRole('button', { name: 'Upload files', exact: true }).click()
    assert.equal(await uploadLocation.inputValue(), '', 'Uploads opened inside stored folders must start at Files root')
    await page.getByRole('button', { name: 'Close Upload files', exact: true }).click()
    const list = page.getByRole('region', { name: 'Files list', exact: true })
    await list.getByRole('button', { name: 'docs', exact: true }).waitFor()
    const workspace = page.locator('.drive-file-workspace')
    const frame = await workspace.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      bottom: element.getBoundingClientRect().bottom + scrollY,
    }))
    const checkFrame = async () => {
      const next = await workspace.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        bottom: element.getBoundingClientRect().bottom + scrollY,
      }))
      assert.ok(
        Math.abs(frame.height - next.height) < 1,
        'Directory types and item counts must not resize the workspace'
      )
      assert.ok(Math.abs(frame.bottom - next.bottom) < 1, 'Switching folders must keep the panel bottom fixed')
    }
    const fewRows = await list.evaluate((element) => ({
      height: element.clientHeight,
      lastBottom: element.querySelector('tbody tr:last-child').getBoundingClientRect().bottom,
      bottom: element.getBoundingClientRect().bottom,
    }))
    assert.ok(fewRows.height >= 320, 'A short list should retain a useful minimum height')
    assert.ok(fewRows.bottom - fewRows.lastBottom >= 16, 'Short lists need space below the last file')
    await page.screenshot({ path: '/tmp/drive-list-few-files.png', fullPage: true, animations: 'disabled' })
    await page.evaluate(async () => {
      const { mutateCachedPieces, getCachedPieces } = await import('/src/lib/local-storage/piece-cache.ts')
      const { directoryUpload } = await import('/src/lib/filecoin-pin/upload-source.ts')
      const { prepareUploadInput } = await import('/src/lib/filecoin-pin/upload-input.ts')
      const { cacheDirectoryUpload } = await import('/src/lib/filecoin-pin/directory.ts')
      const scope = '314:0x1111111111111111111111111111111111111111'
      const existing = getCachedPieces(scope)
      const files = Array.from({ length: 125 }, (_, i) => {
        const name = `entry-${String(i).padStart(3, '0')}.txt`
        const file = new File(['fixture'], name)
        Object.defineProperty(file, 'webkitRelativePath', { value: `many-files/${name}` })
        return file
      })
      const packed = await prepareUploadInput(directoryUpload(files))
      await cacheDirectoryUpload(packed.carBytes, packed.rootCid.toString())
      const template = existing.find((file) => file.fileName === 'reports' && !file.removedCopies?.length)
      const normal = existing.find((file) => file.fileName === 'first.txt')
      await mutateCachedPieces(scope, (current) => [
        ...current,
        ...files.map((file, i) => ({ ...normal, id: `layout-${i}`, fileName: file.name, folderPath: '' })),
        { ...template, id: 'layout-directory', fileName: 'many-files', cid: packed.rootCid.toString() },
      ])
    })
    await page
      .getByRole('navigation', { name: 'Current folder', exact: true })
      .getByRole('button', { name: 'Files', exact: true })
      .click()
    await page
      .getByRole('navigation', { name: 'File folders', exact: true })
      .getByRole('button', { name: 'Files (root)', exact: true })
      .click()
    await page.getByRole('cell').getByRole('button', { name: 'entry-124.txt', exact: true }).waitFor()
    const checkScrolling = async () => {
      const box = await list.boundingBox()
      const head = list.locator('thead')
      await list.evaluate((element) => {
        element.scrollTop = 300
      })
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
      assert.ok(await list.evaluate((element) => element.scrollTop > 0 && element.scrollHeight > element.clientHeight))
      assert.ok(Math.abs((await head.boundingBox()).y - box.y) < 2, 'Table header must stay visible during scrolling')
      assert.ok(box.height < 700, 'Many files must scroll within the list rather than grow the whole page')
    }
    await checkFrame()
    await checkScrolling()
    await page.screenshot({ path: '/tmp/drive-list-many-files.png', fullPage: true, animations: 'disabled' })
    await page
      .getByRole('navigation', { name: 'File folders', exact: true })
      .getByRole('button', { name: 'many-files', exact: true })
      .click()
    await page.getByRole('cell').getByRole('button', { name: 'entry-099.txt', exact: true }).waitFor()
    await checkFrame()
    await checkScrolling()
    await page.screenshot({ path: '/tmp/drive-directory-many-files.png', fullPage: true, animations: 'disabled' })
    const nextPage = page.getByRole('button', { name: 'Next', exact: true })
    assert.ok(
      (await nextPage.boundingBox()).y >= (await list.boundingBox()).y + (await list.boundingBox()).height,
      'Pagination must remain outside the scrolling list'
    )
    await nextPage.click()
    await page.getByRole('cell').getByRole('button', { name: 'entry-124.txt', exact: true }).waitFor()
    assert.equal(await list.evaluate((element) => element.scrollTop), 0, 'Changing pages should start at the top')
    await checkFrame()
    await page.getByRole('searchbox', { name: 'Search this folder', exact: true }).fill('no-matching-entry')
    await page.getByText('No matching files in this folder.', { exact: true }).waitFor()
    await checkFrame()
    await page.screenshot({ path: '/tmp/drive-list-empty.png', fullPage: true, animations: 'disabled' })
    await page.getByRole('searchbox', { name: 'Search this folder', exact: true }).fill('')
    await page.getByRole('cell').getByRole('button', { name: 'entry-000.txt', exact: true }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: '/tmp/drive-directory-list-mobile.png', fullPage: true, animations: 'disabled' })
    const mobileFolderMenu = page
      .getByRole('navigation', { name: 'File folders', exact: true })
      .getByRole('button', { name: 'Files', exact: true })
    await mobileFolderMenu.click()
    await page
      .getByRole('navigation', { name: 'File folders', exact: true })
      .getByRole('button', { name: 'reports', exact: true })
      .click()
    await list.getByRole('button', { name: 'docs', exact: true }).waitFor()
    assert.equal(
      await mobileFolderMenu.getAttribute('aria-expanded'),
      'false',
      'Choosing a mobile folder should return space to the file list'
    )
    assert.ok((await list.boundingBox()).height > 180, 'Mobile navigation must leave room for file rows')

    assert.deepEqual(errors, [])
    console.log(
      'Upload task browser checks passed: parked download, consecutive uploads, per-file details and reload recovery.'
    )
  } finally {
    await context.close()
    await rm(folderFixture, { recursive: true, force: true })
  }
}
