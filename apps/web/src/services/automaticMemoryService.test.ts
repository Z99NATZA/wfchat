import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	delete: vi.fn(),
	ensureCookieSession: vi.fn()
}));

vi.mock("@/services/apiClient", () => ({
	apiClient: { delete: mocks.delete }
}));

vi.mock("@/services/sessionService", () => ({
	ensureCookieSession: mocks.ensureCookieSession
}));

import { resetLearnedContext } from "@/services/automaticMemoryService";

describe("automaticMemoryService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.ensureCookieSession.mockResolvedValue(undefined);
		mocks.delete.mockResolvedValue({ status: 204 });
	});

	it("ensures the cookie session before resetting learned context", async () => {
		await resetLearnedContext();

		expect(mocks.ensureCookieSession).toHaveBeenCalledTimes(1);
		expect(mocks.delete).toHaveBeenCalledWith("/api/learned-context");
		expect(mocks.ensureCookieSession.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.delete.mock.invocationCallOrder[0]
		);
	});
});
