import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	delete: vi.fn(),
	ensureCookieSession: vi.fn(),
	markCookieSessionReady: vi.fn()
}));

vi.mock("@/services/apiClient", () => ({
	apiClient: { delete: mocks.delete }
}));

vi.mock("@/services/sessionService", () => ({
	ensureCookieSession: mocks.ensureCookieSession,
	markCookieSessionReady: mocks.markCookieSessionReady
}));

import { deleteAccount } from "@/services/authService";

describe("authService account deletion", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.ensureCookieSession.mockResolvedValue(undefined);
		mocks.delete.mockResolvedValue({
			data: {
				user_id: "guest-user",
				session_id: "guest-session",
				kind: "guest",
				email: null,
				name: null,
				profile: null,
				cleanup_pending: true
			}
		});
	});

	it("deletes the account and returns the replacement Guest session state", async () => {
		const result = await deleteAccount();

		expect(mocks.ensureCookieSession).toHaveBeenCalledTimes(1);
		expect(mocks.delete).toHaveBeenCalledWith("/api/auth/account");
		expect(mocks.markCookieSessionReady).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			session: {
				userId: "guest-user",
				sessionId: "guest-session",
				kind: "guest",
				email: undefined,
				name: undefined,
				profile: undefined
			},
			cleanupPending: true
		});
	});
});
