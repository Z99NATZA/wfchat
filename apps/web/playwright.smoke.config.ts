import { defineConfig } from "@playwright/test";
import baseConfig, { e2ePort } from "./playwright.config";

const databaseUrl = process.env.WFCHAT_E2E_DATABASE_URL;
const apiPort = 18080;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

if (!databaseUrl) {
	throw new Error("WFCHAT_E2E_DATABASE_URL must point to a disposable PostgreSQL database");
}

const webServers = Array.isArray(baseConfig.webServer)
	? baseConfig.webServer
	: baseConfig.webServer
		? [baseConfig.webServer]
		: [];
const smokeWebServers = webServers.map((server) => ({
	...server,
	env: {
		...server.env,
		VITE_API_BASE_URL: "",
		WFCHAT_API_PROXY_TARGET: apiBaseUrl
	}
}));

export default defineConfig({
	...baseConfig,
	testMatch: "full-stack-smoke.spec.ts",
	testIgnore: [],
	fullyParallel: false,
	webServer: [
		{
			command: "cargo run --manifest-path ../api/Cargo.toml",
			url: `${apiBaseUrl}/api/health`,
			reuseExistingServer: false,
			timeout: 600_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				DATABASE_URL: databaseUrl,
				APP_HOST: "127.0.0.1",
				APP_PORT: String(apiPort),
				FRONTEND_ORIGIN: `http://127.0.0.1:${e2ePort}`,
				FRONTEND_ORIGINS: `http://127.0.0.1:${e2ePort}`,
				AI_PROVIDER: "mock",
				AI_VOICE_PROVIDER: "disabled",
				AI_TRANSCRIPTION_PROVIDER: "disabled"
			}
		},
		...smokeWebServers
	]
});
