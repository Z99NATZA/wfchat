import { apiClient } from "@/services/apiClient";
import { ensureCookieSession, markCookieSessionReady } from "@/services/sessionService";

type ApiSessionResponse = {
	user_id: string;
	session_id: string;
	kind: "guest" | "registered" | "admin";
	email?: string | null;
	name?: string | null;
	profile?: ApiProfileResponse | null;
};

type ApiProfileResponse = {
	display_name: string;
	avatar_url?: string | null;
};

export type AuthSession = {
	userId: string;
	sessionId: string;
	kind: "guest" | "registered" | "admin";
	email?: string;
	name?: string;
	profile?: AuthProfile;
};

export type AuthProfile = {
	displayName: string;
	avatarUrl?: string;
};

export async function fetchCurrentSession(): Promise<AuthSession> {
	const response = await apiClient.get<ApiSessionResponse>("/api/auth/me");
	markCookieSessionReady();
	return toAuthSession(response.data);
}

export async function loginWithGoogle(idToken: string): Promise<AuthSession> {
	await ensureCookieSession();
	const response = await apiClient.post<ApiSessionResponse>("/api/auth/google", { id_token: idToken });
	markCookieSessionReady();
	return toAuthSession(response.data);
}

export async function logoutSession(): Promise<AuthSession> {
	const response = await apiClient.post<ApiSessionResponse>("/api/auth/logout");
	markCookieSessionReady();
	return toAuthSession(response.data);
}

export async function updateProfile(displayName: string, avatarUrl: string): Promise<AuthSession> {
	await ensureCookieSession();
	const response = await apiClient.patch<ApiSessionResponse>(
		"/api/auth/profile",
		{
			display_name: displayName,
			avatar_url: avatarUrl || null
		}
	);
	markCookieSessionReady();
	return toAuthSession(response.data);
}

function toAuthSession(value: ApiSessionResponse): AuthSession {
	const profile = value.profile
		? {
				displayName: value.profile.display_name,
				avatarUrl: value.profile.avatar_url ?? undefined
			}
		: undefined;

	return {
		userId: value.user_id,
		sessionId: value.session_id,
		kind: value.kind,
		email: value.email ?? undefined,
		name: profile?.displayName ?? value.name ?? undefined,
		profile
	};
}
