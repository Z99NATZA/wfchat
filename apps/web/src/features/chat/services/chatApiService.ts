import { AxiosError } from "axios";
import { apiClient } from "@/services/apiClient";
import { readStorageItem, writeStorageItem } from "@/services/storageService";
import type { ChatMessage, ChatPersona, ChatSessionSummary, MemoryFact, MemorySummary } from "@/types/chat";
import { formatMessageTime } from "@/utils/date";

const sessionStorageKey = "wfchat.sessionId";

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
	created_at: number;
	updated_at: number;
};

type ApiSendMessageResponse = {
	messages: ApiMessage[];
};

type ApiChatUiPersona = {
	id: string;
	name: string;
	title: string;
	status: "Online" | "Typing" | "Away";
	last_message: string;
	last_active_at: string;
	unread_count: number;
	avatar_url: string;
};

type ApiChatUiConfig = {
	personas: ApiChatUiPersona[];
	quick_prompts: string[];
};

type ApiMemoryFact = {
	id: string;
	character_id: string;
	content: string;
	confidence: number;
	source_chat_id?: string | null;
	created_at: number;
	updated_at: number;
};

type ApiMemorySummary = {
	id: string;
	character_id: string;
	summary: string;
	source_chat_id?: string | null;
	created_at: number;
};

export async function listPersonaChats(characterId: string): Promise<ChatSessionSummary[]> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.get<ApiChat[]>(`/api/personas/${characterId}/chats`, {
		headers: sessionHeaders(sessionId)
	});
	return response.data.map(toSessionSummary);
}

export async function createPersonaChat(characterId: string): Promise<{ chatId: string; messages: ChatMessage[] }> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.post<ApiChat>(`/api/personas/${characterId}/chats`, undefined, {
		headers: sessionHeaders(sessionId)
	});
	return {
		chatId: response.data.id,
		messages: response.data.messages.map(toChatMessage)
	};
}

export async function getChat(chatId: string): Promise<{ chatId: string; messages: ChatMessage[] }> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.get<ApiChat>(`/api/chats/${chatId}`, {
		headers: sessionHeaders(sessionId)
	});
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

export async function clearChatMessages(chatId: string): Promise<ChatMessage[]> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.delete<ApiChat>(`/api/chats/${chatId}/messages`, {
		headers: sessionHeaders(sessionId)
	});

	return response.data.messages.map(toChatMessage);
}

export async function deleteChat(chatId: string): Promise<void> {
	const sessionId = await ensureGuestSession();
	await apiClient.delete(`/api/chats/${chatId}`, {
		headers: sessionHeaders(sessionId)
	});
}

export async function getChatUiConfig(): Promise<{ personas: ChatPersona[]; quickPrompts: string[] }> {
	const response = await apiClient.get<ApiChatUiConfig>("/api/chat-ui/config");

	return {
		personas: response.data.personas.map((persona) => ({
			id: persona.id,
			name: persona.name,
			title: persona.title,
			status: persona.status,
			lastMessage: persona.last_message,
			lastActiveAt: persona.last_active_at,
			unreadCount: persona.unread_count,
			avatarUrl: persona.avatar_url
		})),
		quickPrompts: response.data.quick_prompts
	};
}

export async function listMemoryFacts(characterId: string): Promise<MemoryFact[]> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.get<ApiMemoryFact[]>(`/api/personas/${characterId}/memory/facts`, {
		headers: sessionHeaders(sessionId)
	});
	return response.data.map(toMemoryFact);
}

export async function createMemoryFact(
	characterId: string,
	content: string,
	confidence?: number,
	sourceChatId?: string
): Promise<MemoryFact> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.post<ApiMemoryFact>(
		`/api/personas/${characterId}/memory/facts`,
		{ content, confidence, source_chat_id: sourceChatId },
		{ headers: sessionHeaders(sessionId) }
	);
	return toMemoryFact(response.data);
}

export async function deleteMemoryFact(factId: string): Promise<void> {
	const sessionId = await ensureGuestSession();
	await apiClient.delete(`/api/memory/facts/${factId}`, {
		headers: sessionHeaders(sessionId)
	});
}

export async function updateMemoryFact(
	factId: string,
	content: string,
	confidence?: number
): Promise<MemoryFact> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.patch<ApiMemoryFact>(
		`/api/memory/facts/${factId}`,
		{ content, confidence },
		{ headers: sessionHeaders(sessionId) }
	);
	return toMemoryFact(response.data);
}

export async function listMemorySummaries(characterId: string): Promise<MemorySummary[]> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.get<ApiMemorySummary[]>(
		`/api/personas/${characterId}/memory/summaries`,
		{
			headers: sessionHeaders(sessionId)
		}
	);
	return response.data.map(toMemorySummary);
}

export async function createMemorySummary(
	characterId: string,
	summary: string,
	sourceChatId?: string
): Promise<MemorySummary> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.post<ApiMemorySummary>(
		`/api/personas/${characterId}/memory/summaries`,
		{ summary, source_chat_id: sourceChatId },
		{ headers: sessionHeaders(sessionId) }
	);
	return toMemorySummary(response.data);
}

export async function deleteMemorySummary(summaryId: string): Promise<void> {
	const sessionId = await ensureGuestSession();
	await apiClient.delete(`/api/memory/summaries/${summaryId}`, {
		headers: sessionHeaders(sessionId)
	});
}

export async function updateMemorySummary(summaryId: string, summary: string): Promise<MemorySummary> {
	const sessionId = await ensureGuestSession();
	const response = await apiClient.patch<ApiMemorySummary>(
		`/api/memory/summaries/${summaryId}`,
		{ summary },
		{ headers: sessionHeaders(sessionId) }
	);
	return toMemorySummary(response.data);
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

function toChatMessage(message: ApiMessage): ChatMessage {
	return {
		id: message.id,
		author: message.role === "user" ? "user" : "companion",
		text: message.content,
		createdAt: message.created_at,
		time: formatMessageTime(new Date(message.created_at * 1000))
	};
}

function toSessionSummary(chat: ApiChat): ChatSessionSummary {
	return {
		id: chat.id,
		characterId: chat.character_id,
		createdAt: chat.created_at,
		updatedAt: chat.updated_at,
		lastMessage: chat.messages.at(-1)?.content ?? ""
	};
}

export function isNotFound(error: unknown): boolean {
	return error instanceof AxiosError && error.response?.status === 404;
}

function toMemoryFact(fact: ApiMemoryFact): MemoryFact {
	return {
		id: fact.id,
		characterId: fact.character_id,
		content: fact.content,
		confidence: fact.confidence,
		sourceChatId: fact.source_chat_id,
		createdAt: fact.created_at,
		updatedAt: fact.updated_at
	};
}

function toMemorySummary(summary: ApiMemorySummary): MemorySummary {
	return {
		id: summary.id,
		characterId: summary.character_id,
		summary: summary.summary,
		sourceChatId: summary.source_chat_id,
		createdAt: summary.created_at
	};
}
