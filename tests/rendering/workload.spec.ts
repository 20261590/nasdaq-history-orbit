import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

for (const arcs of [200, 400, 800]) {
  test(`measure 1500 markers and ${arcs} arcs with actual renderer`, async ({ page }) => {
    await page.goto(`/tests/rendering/benchmark.html?markers=1500&arcs=${arcs}`)
    await expect(page.locator('#ready')).toHaveText('ready')
    await expect(page.getByTestId('globe')).toHaveAttribute('data-markers', '1500')
    await expect(page.getByTestId('globe')).toHaveAttribute('data-arcs', String(arcs))
    const measured = await page.evaluate(async () => {
      const canvas = document.querySelector('.globe-canvas canvas')
      const gl = canvas instanceof HTMLCanvasElement ? canvas.getContext('webgl2') : null
      if (!gl) throw new Error('WebGL2 not initialized')
      const extension = gl.getExtension('WEBGL_debug_renderer_info')
      const renderer = extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
      const frames = await new Promise<number[]>(resolve => {
        const times: number[] = []
        let previous = performance.now()
        const frame = (now: number) => {
          times.push(now - previous)
          previous = now
          if (times.length === 120) resolve(times)
          else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      })
      return {
        renderer, meanMs: frames.reduce((a, b) => a + b, 0) / frames.length,
        p95Ms: [...frames].sort((a, b) => a - b)[113],
        canvasPixels: canvas instanceof HTMLCanvasElement ? [canvas.width, canvas.height] : [],
        cores: navigator.hardwareConcurrency,
      }
    })
    await writeFile(`docs/evidence/phase2/render-${arcs}.json`, JSON.stringify({ markers: 1500, arcs, ...measured }, null, 2))
    if (arcs === 400) await page.screenshot({ path: 'docs/evidence/phase2/render-workload.png' })
    await page.getByRole('button', { name: 'Unmount globe' }).click()
    await expect(page.locator('.globe-canvas canvas')).toHaveCount(0)
    await expect(page.locator('#context-lost')).toHaveText('true')
  })
}

test('resource-limited browser lowers resolution without dropping geographic data', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 })
  try {
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: 2 })
    await page.goto('http://127.0.0.1:5175/tests/rendering/benchmark.html?markers=1500&arcs=400')
    await expect(page.locator('#ready')).toHaveText('ready')
    await expect(page.getByTestId('globe')).toHaveAttribute('data-quality', 'reduced')
    await expect(page.getByTestId('globe')).toHaveAttribute('data-markers', '1500')
    await expect(page.getByTestId('globe')).toHaveAttribute('data-arcs', '400')
    const resolution = await page.locator('.globe-canvas canvas').evaluate(canvas => {
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Globe canvas missing')
      return { deviceScaleFactor: devicePixelRatio, canvasWidth: canvas.width, cssWidth: canvas.clientWidth }
    })
    expect(resolution.deviceScaleFactor).toBe(2)
    expect(resolution.canvasWidth).toBe(resolution.cssWidth)
    await writeFile('docs/evidence/phase2/reduced-quality.json', JSON.stringify({ ...resolution, markerCount: 1500, arcs: 400, coresOverride: 2, mode: 'reduced' }, null, 2))
    await page.screenshot({ path: 'docs/evidence/phase2/reduced-quality.png' })
  } finally { await context.close() }
})

test('sustained synthetic slow-frame timestamps trigger automatic quality reduction', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFrame = window.requestAnimationFrame.bind(window)
    let timestamp = 0
    window.requestAnimationFrame = callback => nativeFrame(() => { timestamp += 40; callback(timestamp) })
  })
  await page.goto('/tests/rendering/benchmark.html?markers=100&arcs=200')
  await expect(page.locator('#ready')).toHaveText('ready')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-quality', 'reduced')
})
