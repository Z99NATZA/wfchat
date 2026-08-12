/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AuthProfileDialog from "@/components/auth/AuthProfileDialog";

vi.mock("@/components/auth/GoogleSignInButton", () => ({
	default: () => <button type="button">Google sign in</button>
}));

vi.mock("@/components/dialog/useDialogBackgroundSurface", () => ({
	useDialogBackgroundSurface: () => ({ ref: { current: null }, style: undefined })
}));

vi.mock("@/i18n/i18nContext", () => ({
	useI18n: () => ({ t: (key: string) => key })
}));

describe("AuthProfileDialog", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("keeps the email heading icon inline while the address starts flush left", () => {
		render(
			<AuthProfileDialog
				isOpen
				isAuthenticated
				profileLabel="Profile name"
				email="profile@example.com"
				hasPendingGuestSync={false}
				backgroundImageUrl=""
				onClose={vi.fn()}
				onLoginWithGoogleIdToken={vi.fn()}
				onLogout={vi.fn()}
				onSyncNow={vi.fn()}
				onUpdateProfile={vi.fn()}
			/>
		);

		const syncSection = screen.getByTestId("profile-sync-section");
		const emailField = screen.getByTestId("profile-email-field");
		const emailLabel = screen.getByText("auth.profile.emailLabel");
		const emailAddress = within(emailField).getByText("profile@example.com");

		expect(screen.getByTestId("profile-summary")).toBeTruthy();
		expect(syncSection.querySelector("svg")).toBeNull();
		expect(emailLabel.parentElement?.className).toContain("gap-1.5");
		expect(emailLabel.parentElement?.querySelector("svg")).not.toBeNull();
		expect(emailAddress.parentElement).toBe(emailField);
		expect(emailAddress.previousElementSibling).toBe(emailLabel.parentElement);
	});

	it("omits the redundant Guest summary while signed out", () => {
		render(
			<AuthProfileDialog
				isOpen
				isAuthenticated={false}
				profileLabel="Guest"
				hasPendingGuestSync={false}
				backgroundImageUrl=""
				onClose={vi.fn()}
				onLoginWithGoogleIdToken={vi.fn()}
				onLogout={vi.fn()}
				onSyncNow={vi.fn()}
				onUpdateProfile={vi.fn()}
			/>
		);

		expect(screen.queryByTestId("profile-summary")).toBeNull();
		expect(screen.getByText("auth.profile.beforeLoginTitle")).toBeTruthy();
	});
});
