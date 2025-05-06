import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  // I can't figure out how to make Worker to import worker.ts properly.
  // {
  //   extends: 'vite.config.ts',
  //   test: {
  //     name: 'node',
  //     environment: 'node'
  //   }
  // },
  {
    extends: 'vite.config.ts',
    test: {
      name: 'browser',
      browser: {
        enabled: true,
        provider: 'playwright',
        // https://vitest.dev/guide/browser/playwright
        instances: [
          {
            browser: 'chromium',
            headless: true,
          }
        ],
      },
    },
  },
])
