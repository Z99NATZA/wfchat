/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AuthProfileDialog from "@/components/auth/AuthProfileDialog";

const dialogMocks = vi.hoisted(() => ({ confirm: vi.fn() }));

vi.mock("@/components/auth/GoogleSignInButton", () => ({
	default: () => <button type="button">Google sign in</button>
}));

vi.mock("@/components/dialog/useDialogBackgroundSurface", () => ({
	useDialogBackgroundSurface: () => ({ ref: { current: null }, style: undefined })
}));

vi.mock("@/components/dialog/DialogContext", () => ({
	useDialog: () => ({ confirm: dialogMocks.confirm })
}));

vi.mock("@/i18n/i18nContext", () => ({
	useI18n: () => ({ t: (key: string) => key })
}));

describe("AuthProfileDialog", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		dialogMocks.confirm.mockReset();
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
				onDeleteAccount={vi.fn()}
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
				onDeleteAccount={vi.fn()}
			/>
		);

		expect(screen.queryByTestId("profile-summary")).toBeNull();
		expect(screen.getByText("auth.profile.beforeLoginTitle")).toBeTruthy();
	});

	it("places destructive account management after Account and requires confirmation", async () => {
		const onDeleteAccount = vi.fn().mockResolvedValue(undefined);
		dialogMocks.confirm.mockResolvedValue(true);
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
				onDeleteAccount={onDeleteAccount}
			/>
		);

		const accountHeading = screen.getByText("auth.profile.accountSection");
		const management = screen.getByTestId("account-management-section");
		const accountSection = accountHeading.closest("section");
		expect(accountSection).not.toBeNull();
		expect(
			accountSection!.compareDocumentPosition(management) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();

		fireEvent.click(screen.getByText("auth.profile.deleteAccount"));
		await waitFor(() => expect(dialogMocks.confirm).toHaveBeenCalledTimes(1));
		expect(dialogMocks.confirm).toHaveBeenCalledWith(
			expect.objectContaining({ tone: "destructive" })
		);
		await waitFor(() => expect(onDeleteAccount).toHaveBeenCalledTimes(1));
	});

	it("does not delete when confirmation is cancelled", async () => {
		const onDeleteAccount = vi.fn();
		dialogMocks.confirm.mockResolvedValue(false);
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
				onDeleteAccount={onDeleteAccount}
			/>
		);

		fireEvent.click(screen.getByText("auth.profile.deleteAccount"));
		await waitFor(() => expect(dialogMocks.confirm).toHaveBeenCalledTimes(1));
		expect(onDeleteAccount).not.toHaveBeenCalled();
	});
});
