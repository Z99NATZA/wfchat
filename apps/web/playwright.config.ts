import { defineConfig, devices } from "@playwright/test";

const e2ePort = 4173;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "list",
	use: {
		baseURL: `http://127.0.0.1:${e2ePort}`,
		trace: "on-first-retry"
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] }
		}
	],
	webServer: {
		command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort}`,
		url: `http://127.0.0.1:${e2ePort}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		env: {
			VITE_API_BASE_URL: "",
			VITE_GOOGLE_CLIENT_ID: "e2e-google-client"
		}
	}
});
