import { AxiosError } from "axios";
import { apiBaseUrl, apiClient } from "@/services/apiClient";
import { ensureCookieSession } from "@/services/sessionService";
import type {
	ChatMessage,
	ChatMessageAttachment,
	ChatPersona,
	ChatSessionSummary
} from "@/types/chat";
import { formatMessageTime } from "@/utils/date";

type ApiMessageRole = "user" | "assistant" | "system";

type ApiMessage = {
	id: string;
	role: ApiMessageRole;
	content: string;
	attachments?: ApiChatAttachment[];
	created_at: number;
};

type ApiChatAttachment = {
	id: string;
	kind: "image";
	mime_type: string;
	byte_size: number;
	width?: number | null;
	height?: number | null;
	preview_url: string;
};

type ApiChat = {
	id: string;
	character_id: string;
	messages: ApiMessage[];
	created_at: number;
	updated_at: number;
};

type ApiChatFollowUp = {
	id: string;
	content: string;
	created_at: number;
};

type ApiChatFollowUpResponse = {
	follow_up: ApiChatFollowUp | null;
};

type ApiSendMessageResponse = {
	messages: ApiMessage[];
};

type ApiStreamMessageStartEvent = {
	chat_id: string;
	persona_id: string;
};

type ApiStreamTokenEvent = {
	text: string;
};

type ApiStreamMessageDoneEvent = {
	chat_id: string;
	user_message: ApiMessage;
	assistant_message: ApiMessage;
	messages: ApiMessage[];
};

type ApiStreamMessageErrorEvent = {
	message: string;
};

export type StreamMessageStartEvent = {
	chatId: string;
	personaId: string;
};

export type StreamMessageDoneEvent = {
	chatId: string;
	userMessage: ChatMessage;
	assistantMessage: ChatMessage;
	messages: ChatMessage[];
};

export type StreamChatMessageHandlers = {
	onStart?: (event: StreamMessageStartEvent) => void;
	onToken?: (text: string) => void;
	onDone?: (event: StreamMessageDoneEvent) => void;
	onError?: (message: string) => void;
};

export type ParsedSseEvent = {
	event: string;
	data: string;
};

export class ChatApiRequestError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ChatApiRequestError";
		this.status = status;
	}
}

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
	voice?: {
		assistant_speech_enabled?: boolean;
		user_transcription_enabled?: boolean;
		credits?: Array<{
			text?: string;
		}>;
	};
};

type ApiSpeechTranscriptionResponse = {
	text: string;
};

export type SendChatMessageAttachment = {
	id: string;
	kind: "image";
};

export type ChatFollowUp = {
	id: string;
	characterId: string;
	content: string;
	createdAt: number;
};

export type VoiceCredit = {
	text: string;
};

export async function listPersonaChats(characterId: string): Promise<ChatSessionSummary[]> {
	await ensureCookieSession();
	const response = await apiClient.get<ApiChat[]>(`/api/personas/${characterId}/chats`);
	return response.data.map(toSessionSummary);
}

export async function createPersonaChat(
	characterId: string,
	followUpId?: string
): Promise<{ chatId: string; messages: ChatMessage[] }> {
	await ensureCookieSession();
	const response = await apiClient.post<ApiChat>(
		`/api/personas/${characterId}/chats`,
		followUpId ? { follow_up_id: followUpId } : undefined
	);
	return {
		chatId: response.data.id,
		messages: response.data.messages.map(toChatMessage)
	};
}

export async function claimPersonaFollowUp(
	characterId: string,
	locale: "en" | "th",
	claimKey: string
): Promise<ChatFollowUp | null> {
	await ensureCookieSession();
	const response = await apiClient.post<ApiChatFollowUpResponse>(
		`/api/personas/${characterId}/follow-up`,
		{ claim_key: claimKey, locale }
	);
	const followUp = response.data.follow_up;
	return followUp
		? {
				id: followUp.id,
				characterId,
				content: followUp.content,
				createdAt: followUp.created_at
			}
		: null;
}

export async function getChat(
	chatId: string
): Promise<{ chatId: string; messages: ChatMessage[] }> {
	await ensureCookieSession();
	const response = await apiClient.get<ApiChat>(`/api/chats/${chatId}`);
	return {
		chatId: response.data.id,
		messages: response.data.messages.map(toChatMessage)
	};
}

export async function sendChatMessage(
	chatId: string,
	content: string,
	attachments: SendChatMessageAttachment[] = []
): Promise<ChatMessage[]> {
	await ensureCookieSession();
	const response = await apiClient.post<ApiSendMessageResponse>(
		`/api/chats/${chatId}/messages`,
		messageRequestBody(content, attachments)
	);

	return response.data.messages.map(toChatMessage);
}

export async function streamChatMessage(
	chatId: string,
	content: string,
	attachments: SendChatMessageAttachment[],
	handlers: StreamChatMessageHandlers
): Promise<void> {
	await ensureCookieSession();
	const response = await fetch(apiUrl(`/api/chats/${chatId}/messages/stream`), {
		method: "POST",
		credentials: "include",
		headers: {
			Accept: "text/event-stream",
			"Content-Type": "application/json"
		},
		body: JSON.stringify(messageRequestBody(content, attachments))
	});

	if (!response.ok) {
		throw await apiRequestError(response);
	}

	if (!response.body) {
		throw new Error("streaming response did not include a body");
	}

	const decoder = new TextDecoder();
	const reader = response.body.getReader();
	const parser = createSseEventParser((event) => dispatchStreamEvent(event, handlers));

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		parser.push(decoder.decode(value, { stream: true }));
	}

	const remainingText = decoder.decode();
	if (remainingText) {
		parser.push(remainingText);
	}
	parser.end();
}

export async function uploadChatImageAttachment(file: File): Promise<ChatMessageAttachment> {
	await ensureCookieSession();
	const formData = new FormData();
	formData.append("file", file, file.name || "image");
	const response = await fetch(apiUrl("/api/chat/attachments"), {
		method: "POST",
		credentials: "include",
		body: formData
	});

	if (!response.ok) {
		throw await apiRequestError(response);
	}

	return toChatAttachment((await response.json()) as ApiChatAttachment);
}

export async function deleteChatAttachment(attachmentId: string): Promise<void> {
	await ensureCookieSession();
	const response = await fetch(apiUrl(`/api/chat/attachments/${attachmentId}`), {
		method: "DELETE",
		credentials: "include"
	});

	if (!response.ok && response.status !== 404) {
		throw await apiRequestError(response);
	}
}

export async function fetchChatAttachmentPreview(attachmentId: string): Promise<Blob> {
	await ensureCookieSession();
	const response = await fetch(apiUrl(`/api/chat/attachments/${attachmentId}/preview`), {
		method: "GET",
		credentials: "include"
	});

	if (!response.ok) {
		throw await apiRequestError(response);
	}

	return response.blob();
}

export async function clearChatMessages(chatId: string): Promise<ChatMessage[]> {
	await ensureCookieSession();
	const response = await apiClient.delete<ApiChat>(`/api/chats/${chatId}/messages`);

	return response.data.messages.map(toChatMessage);
}

export async function deleteChat(chatId: string): Promise<void> {
	await ensureCookieSession();
	await apiClient.delete(`/api/chats/${chatId}`);
}

export async function getChatUiConfig(): Promise<{
	assistantSpeechEnabled: boolean;
	userTranscriptionEnabled: boolean;
	voiceCredits: VoiceCredit[];
	personas: ChatPersona[];
	quickPrompts: string[];
}> {
	const response = await apiClient.get<ApiChatUiConfig>("/api/chat-ui/config");

	return {
		assistantSpeechEnabled: response.data.voice?.assistant_speech_enabled === true,
		userTranscriptionEnabled: response.data.voice?.user_transcription_enabled === true,
		voiceCredits: (response.data.voice?.credits ?? [])
			.map((credit) => ({ text: credit.text?.trim() ?? "" }))
			.filter((credit) => credit.text.length > 0),
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

export async function transcribeUserSpeech(
	audio: Blob,
	options: { signal?: AbortSignal } = {}
): Promise<string> {
	await ensureCookieSession();
	const formData = new FormData();
	const upload = normalizeSpeechAudioForUpload(audio);
	formData.append("file", upload.audio, upload.filename);
	const response = await fetch(apiUrl("/api/chat/transcription"), {
		method: "POST",
		credentials: "include",
		body: formData,
		signal: options.signal
	});

	if (!response.ok) {
		throw await apiRequestError(response);
	}

	const payload = (await response.json()) as ApiSpeechTranscriptionResponse;
	return payload.text;
}

export function normalizeSpeechAudioForUpload(audio: Blob): { audio: Blob; filename: string } {
	const contentType = normalizedSpeechAudioContentType(audio.type);
	const filename = `voice.${speechAudioExtension(contentType)}`;

	if (!contentType || audio.type === contentType) {
		return { audio, filename };
	}

	return {
		audio: new Blob([audio], { type: contentType }),
		filename
	};
}

export async function getAssistantMessageSpeech(
	chatId: string,
	messageId: string,
	options: { signal?: AbortSignal } = {}
): Promise<Blob> {
	const response = await fetchAssistantMessageSpeech(chatId, messageId, options);
	return response.blob();
}

export async function fetchAssistantMessageSpeech(
	chatId: string,
	messageId: string,
	options: { signal?: AbortSignal } = {}
): Promise<Response> {
	await ensureCookieSession();
	const response = await fetch(apiUrl(`/api/chats/${chatId}/messages/${messageId}/speech`), {
		method: "POST",
		credentials: "include",
		signal: options.signal
	});

	if (!response.ok) {
		throw await apiRequestError(response);
	}

	return response;
}

function toChatMessage(message: ApiMessage): ChatMessage {
	return {
		id: message.id,
		author: message.role === "user" ? "user" : "companion",
		text: message.content,
		createdAt: message.created_at,
		time: formatMessageTime(new Date(message.created_at * 1000)),
		attachments: (message.attachments ?? []).map(toChatAttachment)
	};
}

function toChatAttachment(attachment: ApiChatAttachment): ChatMessageAttachment {
	return {
		id: attachment.id,
		kind: attachment.kind,
		mimeType: attachment.mime_type,
		byteSize: attachment.byte_size,
		width: attachment.width,
		height: attachment.height,
		previewUrl: apiUrl(attachment.preview_url)
	};
}

function messageRequestBody(content: string, attachments: SendChatMessageAttachment[]) {
	return {
		content,
		timezone: resolvedUserTimezone(),
		attachments: attachments.map((attachment) => ({
			id: attachment.id,
			kind: attachment.kind
		}))
	};
}

function resolvedUserTimezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
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

export function isChatApiStatus(error: unknown, status: number): boolean {
	return error instanceof ChatApiRequestError && error.status === status;
}

export function createSseEventParser(onEvent: (event: ParsedSseEvent) => void) {
	let buffer = "";

	return {
		push(chunk: string) {
			buffer = `${buffer}${chunk}`.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

			while (true) {
				const frameEndIndex = buffer.indexOf("\n\n");
				if (frameEndIndex < 0) {
					return;
				}

				const frame = buffer.slice(0, frameEndIndex);
				buffer = buffer.slice(frameEndIndex + 2);
				const event = parseSseFrame(frame);
				if (event) {
					onEvent(event);
				}
			}
		},
		end() {
			const event = parseSseFrame(buffer);
			buffer = "";
			if (event) {
				onEvent(event);
			}
		}
	};
}

function parseSseFrame(frame: string): ParsedSseEvent | null {
	let eventName = "message";
	const dataLines: string[] = [];

	for (const line of frame.split("\n")) {
		if (!line || line.startsWith(":")) {
			continue;
		}

		const separatorIndex = line.indexOf(":");
		const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
		let value = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";
		if (value.startsWith(" ")) {
			value = value.slice(1);
		}

		if (field === "event") {
			eventName = value;
		}
		if (field === "data") {
			dataLines.push(value);
		}
	}

	if (dataLines.length === 0) {
		return null;
	}

	return {
		event: eventName,
		data: dataLines.join("\n")
	};
}

function dispatchStreamEvent(event: ParsedSseEvent, handlers: StreamChatMessageHandlers): void {
	switch (event.event) {
		case "message_start": {
			const payload = parseStreamEventData<ApiStreamMessageStartEvent>(event);
			handlers.onStart?.({
				chatId: payload.chat_id,
				personaId: payload.persona_id
			});
			return;
		}
		case "token": {
			const payload = parseStreamEventData<ApiStreamTokenEvent>(event);
			if (payload.text) {
				handlers.onToken?.(payload.text);
			}
			return;
		}
		case "message_done": {
			const payload = parseStreamEventData<ApiStreamMessageDoneEvent>(event);
			handlers.onDone?.({
				chatId: payload.chat_id,
				userMessage: toChatMessage(payload.user_message),
				assistantMessage: toChatMessage(payload.assistant_message),
				messages: payload.messages.map(toChatMessage)
			});
			return;
		}
		case "error": {
			const payload = parseStreamEventData<ApiStreamMessageErrorEvent>(event);
			handlers.onError?.(payload.message);
			throw new Error(payload.message);
		}
	}
}

function parseStreamEventData<TPayload>(event: ParsedSseEvent): TPayload {
	try {
		return JSON.parse(event.data) as TPayload;
	} catch {
		throw new Error(`invalid ${event.event} stream event`);
	}
}

async function readApiError(response: Response): Promise<string> {
	try {
		const body = (await response.clone().json()) as { error?: string };
		return body.error ?? `request failed with status ${response.status}`;
	} catch {
		try {
			const text = (await response.text()).trim();
			return text || `request failed with status ${response.status}`;
		} catch {
			return `request failed with status ${response.status}`;
		}
	}
}

async function apiRequestError(response: Response): Promise<ChatApiRequestError> {
	return new ChatApiRequestError(await readApiError(response), response.status);
}

function apiUrl(path: string): string {
	if (!apiBaseUrl) {
		return path;
	}

	return new URL(path, apiBaseUrl).toString();
}

function normalizedSpeechAudioContentType(contentType: string): string | undefined {
	const baseType = contentType.split(";")[0]?.trim().toLowerCase();

	switch (baseType) {
		case "audio/webm":
			return "audio/webm";
		case "audio/wav":
		case "audio/x-wav":
			return "audio/wav";
		case "audio/mpeg":
		case "audio/mp3":
			return "audio/mpeg";
		case "audio/mp4":
		case "audio/x-m4a":
			return "audio/mp4";
		case "audio/ogg":
			return "audio/ogg";
		case "audio/flac":
			return "audio/flac";
		default:
			return undefined;
	}
}

function speechAudioExtension(contentType: string | undefined): string {
	switch (contentType) {
		case "audio/wav":
			return "wav";
		case "audio/mpeg":
			return "mp3";
		case "audio/mp4":
			return "m4a";
		case "audio/ogg":
			return "ogg";
		case "audio/flac":
			return "flac";
		case "audio/webm":
		default:
			return "webm";
	}
}
