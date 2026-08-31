/**
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiClientMock = vi.hoisted(() => ({
	get: vi.fn()
}));

vi.mock("@/services/apiClient", () => ({
	apiClient: apiClientMock
}));

import { ensureCookieSession, markCookieSessionReady } from "@/services/sessionService";

const sessionCookieReadyKey = "wfchat.sessionCookieReady";
const legacySessionStorageKey = "wfchat.sessionId";

function installLocalStorageMock() {
	const storage = new Map<string, string>();
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: {
			clear: vi.fn(() => storage.clear()),
			getItem: vi.fn((key: string) => storage.get(key) ?? null),
			removeItem: vi.fn((key: string) => {
				storage.delete(key);
			}),
			setItem: vi.fn((key: string, value: string) => {
				storage.set(key, value);
			})
		}
	});
}

beforeEach(() => {
	installLocalStorageMock();
	window.localStorage.clear();
	window.sessionStorage.clear();
	apiClientMock.get.mockReset();
});

afterEach(() => {
	window.localStorage.clear();
	window.sessionStorage.clear();
	vi.restoreAllMocks();
});

describe("sessionService", () => {
	it("bootstraps cookie auth from current session without storing the session id", async () => {
		window.localStorage.setItem(legacySessionStorageKey, "session-1");
		apiClientMock.get.mockResolvedValueOnce({ data: { session_id: "session-2" } });

		await ensureCookieSession();

		expect(apiClientMock.get).toHaveBeenCalledWith("/api/auth/me");
		expect(window.sessionStorage.getItem(sessionCookieReadyKey)).toBe("true");
		expect(window.localStorage.getItem(legacySessionStorageKey)).toBeNull();
	});

	it("skips bootstrap when the cookie-ready marker exists", async () => {
		markCookieSessionReady();

		await ensureCookieSession();

		expect(apiClientMock.get).not.toHaveBeenCalled();
	});

	it("shares one bootstrap request across concurrent session consumers", async () => {
		let resolveRequest: ((value: { data: { session_id: string } }) => void) | undefined;
		apiClientMock.get.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveRequest = resolve;
				})
		);

		const first = ensureCookieSession();
		const second = ensureCookieSession();

		expect(apiClientMock.get).toHaveBeenCalledTimes(1);
		resolveRequest?.({ data: { session_id: "shared-session" } });
		await Promise.all([first, second]);
		expect(window.sessionStorage.getItem(sessionCookieReadyKey)).toBe("true");
	});

	it("allows bootstrap to retry after a failed request", async () => {
		apiClientMock.get
			.mockRejectedValueOnce(new Error("temporary failure"))
			.mockResolvedValueOnce({ data: { session_id: "session-after-retry" } });

		await expect(ensureCookieSession()).rejects.toThrow("temporary failure");
		await ensureCookieSession();

		expect(apiClientMock.get).toHaveBeenCalledTimes(2);
		expect(window.sessionStorage.getItem(sessionCookieReadyKey)).toBe("true");
	});
});
