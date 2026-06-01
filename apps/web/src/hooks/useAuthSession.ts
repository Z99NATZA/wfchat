import { useMemo, useState } from "react";
import { readStorageItem, writeStorageItem } from "@/services/storageService";

type AuthProvider = "google" | "email";

type AuthUser = {
	id: string;
	name: string;
	email: string;
	provider: AuthProvider;
};

type AuthState = {
	user: AuthUser | null;
	hasPendingGuestSync: boolean;
};

const AUTH_STORAGE_KEY = "wfchat-auth-state";

function readInitialAuthState(): AuthState {
	const raw = readStorageItem(AUTH_STORAGE_KEY);

	if (!raw) {
		return {
			user: null,
			hasPendingGuestSync: true
		};
	}

	try {
		const parsed = JSON.parse(raw) as Partial<AuthState>;
		const user = parsed.user ?? null;
		const hasPendingGuestSync = parsed.hasPendingGuestSync ?? true;
		return { user, hasPendingGuestSync };
	} catch {
		return {
			user: null,
			hasPendingGuestSync: true
		};
	}
}

function persistState(nextState: AuthState) {
	writeStorageItem(AUTH_STORAGE_KEY, JSON.stringify(nextState));
}

export function useAuthSession() {
	const [state, setState] = useState<AuthState>(() => readInitialAuthState());

	const isAuthenticated = Boolean(state.user);

	function login(provider: AuthProvider) {
		const nextState: AuthState = {
			...state,
			user: {
				id: "wfchat-member-01",
				name: provider === "google" ? "Google Member" : "Email Member",
				email: provider === "google" ? "member@gmail.com" : "member@wfchat.app",
				provider
			}
		};
		setState(nextState);
		persistState(nextState);
	}

	function logout() {
		const nextState: AuthState = {
			user: null,
			hasPendingGuestSync: true
		};
		setState(nextState);
		persistState(nextState);
	}

	function markGuestSyncDone() {
		const nextState: AuthState = {
			...state,
			hasPendingGuestSync: false
		};
		setState(nextState);
		persistState(nextState);
	}

	const profileLabel = useMemo(() => {
		if (!state.user) {
			return "Guest";
		}

		return state.user.name;
	}, [state.user]);

	return {
		user: state.user,
		isAuthenticated,
		hasPendingGuestSync: state.hasPendingGuestSync,
		profileLabel,
		login,
		logout,
		markGuestSyncDone
	};
}
