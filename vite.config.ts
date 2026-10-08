/// <reference types="vitest/config" />

// https://vite.dev/config/
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import path from 'path'
import { defineConfig } from 'vite'

const dirname = typeof __dirname === 'undefined' ? path.dirname(fileURLToPath(import.meta.url)) : __dirname

const synapseSdkVersion = JSON.parse(readFileSync(path.resolve(dirname, 'package-lock.json'), 'utf8')).packages[
  'node_modules/@filoz/synapse-sdk'
]?.version
if (!synapseSdkVersion) throw new Error('Synapse SDK version is missing from package-lock.json. Run npm ci first.')

// More info at: https://storybook.js.org/docs/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __SYNAPSE_SDK_VERSION__: JSON.stringify(synapseSdkVersion),
    'process.env': {
      PROVIDER_ADDRESS: process.env.PROVIDER_ADDRESS,
    },
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
      '@/components': path.resolve(dirname, './src/components'),
      '@/context': path.resolve(dirname, './src/context'),
      '@/hooks': path.resolve(dirname, './src/hooks'),
      '@/lib': path.resolve(dirname, './src/lib'),
      '@/utils': path.resolve(dirname, './src/utils'),
      process: 'process/browser',
      buffer: 'buffer',
    },
  },
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/writing-tests/vitest-plugin#storybooktest
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
          setupFiles: ['.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
})
