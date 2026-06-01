/// <reference types="vitest/config" />

// https://vite.dev/config/
import { fileURLToPath } from 'node:url'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import path from 'path'
import { defineConfig } from 'vite'

const dirname = typeof __dirname === 'undefined' ? path.dirname(fileURLToPath(import.meta.url)) : __dirname

// filecoin-pin's `common/get-rpc-url.js` statically imports node:fs/os/path for
// devnet support and cannot be bundled for the browser. It is only reached via a
// guarded lazy import in resolveChainFromRpc for devnet chain ids — a path this
// app never takes — so redirect it to a browser-safe stub during bundling.
function stubFilecoinPinDevnetRpc() {
  const stub = path.resolve(dirname, './src/lib/filecoin-pin/get-rpc-url-browser-stub.ts')
  return {
    name: 'stub-filecoin-pin-devnet-rpc',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      if (source.endsWith('common/get-rpc-url.js') && importer?.includes('filecoin-pin')) {
        return stub
      }
      return null
    },
  }
}

// More info at: https://storybook.js.org/docs/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [stubFilecoinPinDevnetRpc(), react(), tailwindcss()],
  define: {
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
