import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { prepareBrowserPage } from './drive-browser-fixtures.mjs'

// Exercise real shared components and their compiled CSS against npm run dev.
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } })
  await page.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
  await page.evaluate(async () => {
    const { createElement: h } = (await import('/node_modules/.vite/deps/react.js')).default
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
    const names = [
      'download-button',
      'badge-status',
      'badge-replication',
      'badge-number',
      'alert',
      'link',
      'text-with-copy-to-clipboard',
      'button/button-base',
      'dialog',
      'spinner',
      'progress-bar',
      'page-title',
      'select',
    ]
    const modules = await Promise.all(names.map((name) => import(`/src/components/ui/${name}.tsx`)))
    const [download, status, replication, number, alert, link, copy, button, dialog, spinner, progress, title, select] =
      modules
    const { SelectedFile } = await import('/src/components/file-picker/selected-file.tsx')
    const cases = []
    const add = (name, node) =>
      cases.push(
        h(
          'section',
          {
            key: name,
            'data-case': name,
            style: {
              padding: 20,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              borderRadius: 12,
            },
          },
          node
        )
      )
    add('download', h(download.DownloadButton, { href: '#file' }))
    add(
      'selected-file',
      h(SelectedFile, {
        file: new File(['test'], 'research-2026.pdf'),
        onReset() {
          /* The gallery keeps the example file selected. */
        },
      })
    )
    add('link', h(link.TextLink, { href: '#file' }, 'Download original file'))
    add('copy', h(copy.TextWithCopyToClipboard, { text: 'bafy-example-file', href: '#file' }))
    add('number', h(number.BadgeNumber, { number: 1 }))
    add('spinner', h(spinner.Spinner))
    add('progress', h(progress.ProgressBar, { progress: 50 }))
    add('title', h(title.PageTitle))
    add('select', h(select.Select, { 'aria-label': 'Example network' }, h('option', null, 'Filecoin Mainnet')))
    add('dialog', h(dialog.Dialog, { content: h('p', null, 'File details and storage configuration') }))
    for (const value of ['completed', 'pinned', 'published', 'error', 'pending', 'in-progress'])
      add(`status-${value}`, h(status.BadgeStatus, { status: value }))
    for (const value of [1, 2]) add(`replication-${value}`, h(replication.BadgeReplication, { copyCount: value }))
    for (const variant of ['primary', 'secondary', 'danger']) {
      add(`button-${variant}`, h(button.ButtonBase, { variant }, 'Manage files'))
      add(`disabled-${variant}`, h(button.ButtonBase, { variant, disabled: true }, 'Unavailable'))
    }
    for (const variant of ['success', 'error', 'info', 'warning', 'neutral'])
      add(
        `alert-${variant}`,
        h(alert.Alert, {
          variant,
          message: 'Storage operation status',
          description: 'Review the file details.',
          button: { children: 'Continue' },
          cancelButton: { children: 'Cancel' },
        })
      )
    document.querySelector('#root').style.display = 'none'
    const container = document.createElement('main')
    container.id = 'theme-audit'
    container.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:24px'
    document.body.append(container)
    createRoot(container).render(cases)
  })
  await page.locator('[data-case=download] a').waitFor()
  const audit = async (target = page, root = '#theme-audit') =>
    target.evaluate((root) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const parse = (value) => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = value
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
        return [r, g, b, a / 255]
      }
      const blend = (top, bottom) => [...top.slice(0, 3).map((c, i) => c * top[3] + bottom[i] * (1 - top[3])), 1]
      const background = (element) => {
        const chain = []
        for (let e = element; e; e = e.parentElement) chain.unshift(e)
        return chain.reduce((color, e) => blend(parse(getComputedStyle(e).backgroundColor), color), [255, 255, 255, 1])
      }
      const luminance = (color) =>
        color.slice(0, 3).reduce((sum, c, i) => {
          const channel = c / 255
          return (
            sum +
            (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i]
          )
        }, 0)
      const ratio = (a, b) =>
        (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
      const failures = []
      const inspect = (element, label, minimum, colorOverride) => {
        if (element.closest('[disabled],.sr-only,[hidden]') || !element.getClientRects().length) return
        const style = getComputedStyle(element)
        if (style.visibility !== 'visible') return
        const bg = background(element)
        const value = ratio(blend(parse(colorOverride || style.color), bg), bg)
        if (value + 0.01 < minimum)
          failures.push({
            case: element.closest('[data-case]')?.dataset.case || 'dialog',
            label,
            color: colorOverride || style.color,
            background: bg,
            ratio: Number(value.toFixed(2)),
            minimum,
          })
      }
      const walker = document.createTreeWalker(document.querySelector(root), NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        if (!node.textContent.trim()) continue
        const element = node.parentElement
        const style = getComputedStyle(element)
        const large =
          parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700)
        inspect(element, node.textContent.trim(), large ? 3 : 4.5)
      }
      for (const icon of document.querySelectorAll(`${root} svg,[role=dialog] svg`)) inspect(icon, 'icon', 3)
      for (const text of document.querySelectorAll('[role=dialog] p')) inspect(text, text.textContent, 4.5)
      for (const field of document.querySelectorAll(
        `${root} input:not([type=checkbox]),${root} select,${root} textarea`
      )) {
        inspect(field, field.value || 'field', 4.5)
        if (!field.value && field.placeholder)
          inspect(field, field.placeholder, 4.5, getComputedStyle(field, '::placeholder').color)
      }
      return failures
    }, root)
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme
    }, theme)
    await page.mouse.move(0, 0)
    await page.waitForTimeout(200)
    assert.deepEqual(await audit(), [], `${theme}: default component contrast`)
    const controls = page.locator('#theme-audit a,#theme-audit button:not([disabled])')
    for (let index = 0; index < (await controls.count()); index++) {
      await controls.nth(index).focus()
      await page.waitForTimeout(180)
      assert.deepEqual(await audit(), [], `${theme}: focused control ${index}`)
      await controls.nth(index).hover()
      await page.waitForTimeout(180)
      assert.deepEqual(await audit(), [], `${theme}: hovered control ${index}`)
    }
    await page.locator('[data-case=dialog] button').click()
    await page.getByRole('dialog').waitFor()
    assert.deepEqual(await audit(), [], `${theme}: dialog contrast`)
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.screenshot({ path: `/tmp/drive-components-${theme}.png`, fullPage: true, animations: 'disabled' })
    console.log(`${theme}: shared text, icons, links, badges, alerts, buttons, file picker and dialog contrast passed`)
  }
  const consolePage = await browser.newPage({ viewport: { width: 1440, height: 1080 } })
  await prepareBrowserPage(consolePage)
  await consolePage.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
  for (const theme of ['light', 'dark']) {
    await consolePage.evaluate((theme) => {
      document.documentElement.dataset.theme = theme
    }, theme)
    await consolePage.waitForTimeout(200)
    assert.deepEqual(await audit(consolePage, 'body'), [], `${theme}: landing contrast`)
  }
  await consolePage.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  await consolePage.getByRole('button', { name: 'report.pdf', exact: true }).waitFor()
  for (const theme of ['light', 'dark']) {
    await consolePage.evaluate((theme) => {
      document.documentElement.dataset.theme = theme
    }, theme)
    await consolePage.waitForTimeout(200)
    assert.deepEqual(await audit(consolePage, 'body'), [], `${theme}: console contrast`)
    await consolePage.getByRole('button', { name: 'report.pdf', exact: true }).click()
    await consolePage.getByRole('button', { name: 'Close details', exact: true }).waitFor()
    assert.deepEqual(await audit(consolePage, 'body'), [], `${theme}: file details contrast`)
    const preview = consolePage.getByRole('link', { name: 'Preview', exact: true })
    const previewUrl = new URL(await preview.getAttribute('href'))
    assert(previewUrl.hostname.endsWith('.ipfs.inbrowser.link'))
    assert.equal(previewUrl.searchParams.get('filename'), 'report.pdf')
    assert.equal(previewUrl.searchParams.has('download'), false)
    assert.equal(await preview.getAttribute('target'), '_blank')
    assert((await preview.getAttribute('rel')).includes('noopener'))
    await consolePage.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value) => {
            window.__copiedCid = value
          },
        },
      })
    })
    for (const label of ['IPFS root CID', 'Piece CID']) {
      const copyButton = consolePage.getByRole('button', { name: `Copy ${label}`, exact: true })
      const expected = await consolePage.getByLabel(label, { exact: true }).inputValue()
      await copyButton.click()
      await copyButton.getByText('Copied!', { exact: true }).waitFor()
      assert.equal(await consolePage.evaluate(() => window.__copiedCid), expected)
      await consolePage.waitForTimeout(250)
      assert.deepEqual(await audit(consolePage, 'body'), [], `${theme}: copy confirmation contrast`)
      await copyButton.getByText(`Copy ${label}`, { exact: true }).waitFor()
    }
    await consolePage.screenshot({ path: `/tmp/drive-details-${theme}.png`, fullPage: true, animations: 'disabled' })
    await consolePage.getByRole('button', { name: 'Close details', exact: true }).click()
    console.log(`${theme}: landing, wallet console, file table, directory controls and file details contrast passed`)
  }
  await consolePage.getByRole('button', { name: 'report.pdf', exact: true }).click()
  await consolePage.getByLabel('Display name', { exact: true }).fill('report.tar.gz')
  await consolePage.getByRole('button', { name: 'Save directory changes', exact: true }).click()
  assert.equal(await consolePage.getByRole('button', { name: 'Preview', exact: true }).isDisabled(), true)
  assert.equal(
    await consolePage.getByRole('button', { name: 'Download original file', exact: true }).isDisabled(),
    false
  )
  console.log('PDF preview URL and unsupported-format download fallback passed')
} finally {
  await browser.close()
}
