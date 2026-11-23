import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: process.env.PAGES_BASE_PATH ?? './',
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three'
          if (id.includes('/node_modules/three-globe/')) return 'globe'
          if (id.includes('/node_modules/echarts/') || id.includes('/node_modules/zrender/')) return 'charts'
        },
      },
    },
  },
})
