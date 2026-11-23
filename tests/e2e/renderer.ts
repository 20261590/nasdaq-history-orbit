import type { Page } from '@playwright/test'

export async function actualRenderer(page: Page): Promise<string> {
  return page.getByTestId('globe').locator('canvas').evaluate(canvas => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Globe canvas missing')
    const gl = canvas.getContext('webgl2')
    if (!gl) throw new Error('WebGL2 context missing')
    const extension = gl.getExtension('WEBGL_debug_renderer_info')
    return String(gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
  })
}
