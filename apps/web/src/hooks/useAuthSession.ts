import { useEffect, useMemo, useState } from "react";
import { readStorageItem, writeStorageItem } from "@/services/storageService";
import {
	fetchCurrentSession,
	loginWithGoogle,
	logoutSession,
	updateProfile,
	type AuthSession
} from "@/services/authService";

type AuthProvider = "google";

type AuthUser = {
	id: string;
	name: string;
	email?: string;
	avatarUrl?: string;
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
	const [isLoading, setIsLoading] = useState(true);

	const isAuthenticated = Boolean(state.user);

	useEffect(() => {
		void fetchCurrentSession()
			.then((session) => {
				setState((current) => {
					const nextState = {
						...current,
						user: session.kind === "guest" ? null : mapSessionToUser(session, "google")
					};
					persistState(nextState);
					return nextState;
				});
			})
			.finally(() => setIsLoading(false));
	}, []);

	async function loginGoogleWithIdToken(idToken: string) {
		const session = await loginWithGoogle(idToken);
		const nextState: AuthState = {
			...state,
			user: mapSessionToUser(session, "google")
		};
		setState(nextState);
		persistState(nextState);
	}

	async function logout() {
		const session = await logoutSession();
		const nextState: AuthState = {
			user: null,
			hasPendingGuestSync: session.kind === "guest"
		};
		setState(nextState);
		persistState(nextState);
	}

	async function updateUserProfile(displayName: string, avatarUrl: string) {
		const session = await updateProfile(displayName, avatarUrl);
		const nextState: AuthState = {
			...state,
			user: mapSessionToUser(session, "google")
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
		isLoading,
		hasPendingGuestSync: state.hasPendingGuestSync,
		profileLabel,
		loginGoogleWithIdToken,
		logout,
		updateProfile: updateUserProfile,
		markGuestSyncDone
	};
}

function mapSessionToUser(session: AuthSession, provider: AuthProvider): AuthUser {
	return {
		id: session.userId,
		name: session.name ?? "Member",
		email: session.email,
		avatarUrl: session.profile?.avatarUrl,
		provider
	};
}
