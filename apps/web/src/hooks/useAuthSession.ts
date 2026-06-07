import { useCallback, useEffect, useMemo, useState } from "react";
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

	const loginGoogleWithIdToken = useCallback(async (idToken: string) => {
		const session = await loginWithGoogle(idToken);
		setState((current) => {
			const nextState: AuthState = {
				...current,
				user: mapSessionToUser(session, "google")
			};
			persistState(nextState);
			return nextState;
		});
	}, []);

	const logout = useCallback(async () => {
		const session = await logoutSession();
		const nextState: AuthState = {
			user: null,
			hasPendingGuestSync: session.kind === "guest"
		};
		setState(nextState);
		persistState(nextState);
	}, []);

	const updateUserProfile = useCallback(async (displayName: string, avatarUrl: string) => {
		const session = await updateProfile(displayName, avatarUrl);
		setState((current) => {
			const nextState: AuthState = {
				...current,
				user: mapSessionToUser(session, "google")
			};
			persistState(nextState);
			return nextState;
		});
	}, []);

	const markGuestSyncDone = useCallback(() => {
		setState((current) => {
			const nextState: AuthState = {
				...current,
				hasPendingGuestSync: false
			};
			persistState(nextState);
			return nextState;
		});
	}, []);

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

export type AuthSessionController = ReturnType<typeof useAuthSession>;

function mapSessionToUser(session: AuthSession, provider: AuthProvider): AuthUser {
	return {
		id: session.userId,
		name: session.name ?? "Member",
		email: session.email,
		avatarUrl: session.profile?.avatarUrl,
		provider
	};
}
