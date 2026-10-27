import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

// Exercise the production bundle with the response CSP used by Docker nginx.
export default defineConfig({
	...baseConfig,
	testMatch: "cozy-farm.spec.ts",
	use: { ...baseConfig.use, baseURL: "http://127.0.0.1:4183" },
	projects: [{ ...baseConfig.projects![0], name: "chromium-csp" }],
	webServer: {
		command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4183 --strictPort",
		url: "http://127.0.0.1:4183",
		reuseExistingServer: false,
		env: { VITE_API_BASE_URL: "", VITE_GOOGLE_CLIENT_ID: "e2e-google-client" },
		timeout: 120_000
	}
});
