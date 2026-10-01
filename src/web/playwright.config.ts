import { defineConfig, devices } from '@playwright/test'

// Runs against a live stack: `dotnet run --project src/Circloo.AppHost`, then set
// E2E_BASE_URL to the web endpoint and MAILPIT_URL to the Mailpit UI endpoint.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'en', use: { ...devices['Desktop Chrome'], locale: 'en-GB' } },
    { name: 'ar', use: { ...devices['Pixel 7'], locale: 'ar-MA' } },
  ],
})
