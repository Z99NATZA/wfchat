import { apiClient } from "@/services/apiClient";
import { readStorageItem, writeStorageItem } from "@/services/storageService";

const sessionStorageKey = "wfchat.sessionId";

type ApiSessionResponse = {
	user_id: string;
	session_id: string;
	kind: "guest" | "registered" | "admin";
	email?: string | null;
	name?: string | null;
};

export type AuthSession = {
	userId: string;
	sessionId: string;
	kind: "guest" | "registered" | "admin";
	email?: string;
	name?: string;
};

export async function fetchCurrentSession(): Promise<AuthSession> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.get<ApiSessionResponse>("/api/auth/me", {
		headers: sessionHeaders(sessionId)
	});
	writeStorageItem(sessionStorageKey, response.data.session_id);
	return toAuthSession(response.data);
}

export async function loginWithGoogle(idToken: string): Promise<AuthSession> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.post<ApiSessionResponse>(
		"/api/auth/google",
		{ id_token: idToken },
		{ headers: sessionHeaders(sessionId) }
	);
	writeStorageItem(sessionStorageKey, response.data.session_id);
	return toAuthSession(response.data);
}

async function ensureGuestSession(): Promise<string> {
	const existingSessionId = readStorageItem(sessionStorageKey);
	if (existingSessionId) {
		return existingSessionId;
	}
	const response = await apiClient.post<ApiSessionResponse>("/api/auth/guest");
	writeStorageItem(sessionStorageKey, response.data.session_id);
	return response.data.session_id;
}

function sessionHeaders(sessionId: string) {
	return { "X-WFChat-Session": sessionId };
}

function toAuthSession(value: ApiSessionResponse): AuthSession {
	return {
		userId: value.user_id,
		sessionId: value.session_id,
		kind: value.kind,
		email: value.email ?? undefined,
		name: value.name ?? undefined
	};
}
