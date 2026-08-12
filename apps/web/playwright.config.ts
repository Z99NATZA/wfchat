import { defineConfig, devices } from "@playwright/test";

const configuredE2ePort = Number(process.env.WFCHAT_E2E_PORT ?? 4173);

if (!Number.isInteger(configuredE2ePort) || configuredE2ePort < 1 || configuredE2ePort > 65_535) {
	throw new Error("WFCHAT_E2E_PORT must be a valid TCP port");
}

export const e2ePort = configuredE2ePort;

export default defineConfig({
	testDir: "./e2e",
	testIgnore: "full-stack-smoke.spec.ts",
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
