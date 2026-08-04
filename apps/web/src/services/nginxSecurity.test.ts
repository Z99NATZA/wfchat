import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const nginxConfig = readFileSync(new URL("../../nginx.conf", import.meta.url), "utf8");

describe("production web security headers", () => {
	it("denies framing and sends the required browser hardening headers", () => {
		expect(nginxConfig).toContain("frame-ancestors 'none'");
		expect(nginxConfig).toContain('add_header X-Content-Type-Options "nosniff" always;');
		expect(nginxConfig).toContain('add_header X-Frame-Options "DENY" always;');
		expect(nginxConfig).toContain(
			'add_header Referrer-Policy "strict-origin-when-cross-origin" always;'
		);
	});

	it("keeps the CSP compatible with the app's owned and explicitly trusted resources", () => {
		expect(nginxConfig).toContain("script-src 'self' https://accounts.google.com");
		expect(nginxConfig).toContain(
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
		);
		expect(nginxConfig).toContain("font-src 'self' data: https://fonts.gstatic.com");
		expect(nginxConfig).toContain("img-src 'self' data: blob: https:");
		expect(nginxConfig).toContain("connect-src 'self' https: wss:");
	});
});
