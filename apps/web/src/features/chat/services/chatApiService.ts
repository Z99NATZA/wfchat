import { AxiosError } from "axios";
import { apiClient } from "@/services/apiClient";
import { readStorageItem, writeStorageItem } from "@/services/storageService";
import type { ChatMessage } from "@/types/chat";
import { formatMessageTime } from "@/utils/date";

const sessionStorageKey = "wfchat.sessionId";
const chatStorageKeyPrefix = "wfchat.chatId.";

type ApiSessionResponse = {
	session_id: string;
};

type ApiMessageRole = "user" | "assistant" | "system";

type ApiMessage = {
	id: string;
	role: ApiMessageRole;
	content: string;
	created_at: number;
};

type ApiChat = {
	id: string;
	character_id: string;
	messages: ApiMessage[];
};

type ApiSendMessageResponse = {
	assistant_message: ApiMessage;
	user_message: ApiMessage;
	messages: ApiMessage[];
};

export async function getOrCreateChat(characterId: string): Promise<{ chatId: string; messages: ChatMessage[] }> {
	const sessionId = await ensureGuestSession();
	const cachedChatId = readStorageItem(chatStorageKey(characterId));

	if (cachedChatId) {
		try {
			const response = await apiClient.get<ApiChat>(`/api/chats/${cachedChatId}`, {
				headers: sessionHeaders(sessionId)
			});

			return {
				chatId: response.data.id,
				messages: response.data.messages.map(toChatMessage)
			};
		} catch (error) {
			if (!isNotFound(error)) {
				throw error;
			}
		}
	}

	const response = await apiClient.post<ApiChat>(
		"/api/chats",
		{ character_id: characterId },
		{ headers: sessionHeaders(sessionId) }
	);

	writeStorageItem(chatStorageKey(characterId), response.data.id);

	return {
		chatId: response.data.id,
		messages: response.data.messages.map(toChatMessage)
	};
}

export async function sendChatMessage(chatId: string, content: string): Promise<ChatMessage[]> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.post<ApiSendMessageResponse>(
		`/api/chats/${chatId}/messages`,
		{ content },
		{ headers: sessionHeaders(sessionId) }
	);

	return response.data.messages.map(toChatMessage);
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
	return {
		"X-WFChat-Session": sessionId
	};
}

function chatStorageKey(characterId: string): string {
	return `${chatStorageKeyPrefix}${characterId}`;
}

function toChatMessage(message: ApiMessage): ChatMessage {
	return {
		id: message.id,
		author: message.role === "user" ? "user" : "companion",
		text: message.content,
		time: formatMessageTime(new Date(message.created_at * 1000))
	};
}

function isNotFound(error: unknown): boolean {
	return error instanceof AxiosError && error.response?.status === 404;
}
