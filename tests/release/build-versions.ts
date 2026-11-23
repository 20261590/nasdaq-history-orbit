import { build } from 'vite'
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

const temp = process.env.RC_TMP
if (!temp) throw new TypeError('RC_TMP must identify the owned release QA directory')
for (const version of ['A', 'B']) {
  await build({
    configFile: resolve('vite.config.ts'),
    build: { outDir: resolve(temp, 'versions', version), emptyOutDir: true },
    plugins: [{
      name: 'qa-only-release-version',
      transform(code, id) {
        if (id === resolve('src/main.ts')) return code + `\ndocument.documentElement.dataset.rcVersion = '${version}'\n`
      },
    }],
  })
}
await mkdir(temp, { recursive: true })
await writeFile(resolve(temp, 'active-version'), 'A')
