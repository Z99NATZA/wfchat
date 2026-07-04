/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createSseEventParser,
	normalizeSpeechAudioForUpload,
	sendChatMessage,
	streamChatMessage,
	type ParsedSseEvent
} from "@/features/chat/services/chatApiService";
import { apiClient } from "@/services/apiClient";

const sessionCookieReadyKey = "wfchat.sessionCookieReady";

describe("chat SSE parser", () => {
	it("parses events split across chunks", () => {
		const events: ParsedSseEvent[] = [];
		const parser = createSseEventParser((event) => events.push(event));

		parser.push("event: token\ndata: {\"text\":\"hel");
		parser.push("lo\"}\n\n");

		expect(events).toEqual([
			{
				event: "token",
				data: "{\"text\":\"hello\"}"
			}
		]);
	});

	it("parses multiple CRLF-framed events in one chunk", () => {
		const events: ParsedSseEvent[] = [];
		const parser = createSseEventParser((event) => events.push(event));

		parser.push(
			"event: message_start\r\ndata: {\"chat_id\":\"chat-1\",\"persona_id\":\"aiko\"}\r\n\r\n" +
				"event: token\r\ndata: {\"text\":\"hi\"}\r\n\r\n"
		);

		expect(events).toEqual([
			{
				event: "message_start",
				data: "{\"chat_id\":\"chat-1\",\"persona_id\":\"aiko\"}"
			},
			{
				event: "token",
				data: "{\"text\":\"hi\"}"
			}
		]);
	});

	it("joins multi-line data and ignores comments", () => {
		const events: ParsedSseEvent[] = [];
		const parser = createSseEventParser((event) => events.push(event));

		parser.push(": keepalive\nevent: token\ndata: first\ndata: second\n\n");

		expect(events).toEqual([
			{
				event: "token",
				data: "first\nsecond"
			}
		]);
	});

	it("flushes a final frame without a trailing blank line", () => {
		const events: ParsedSseEvent[] = [];
		const parser = createSseEventParser((event) => events.push(event));

		parser.push("event: error\ndata: {\"message\":\"failed\"}");
		parser.end();

		expect(events).toEqual([
			{
				event: "error",
				data: "{\"message\":\"failed\"}"
			}
		]);
	});
});

describe("speech audio upload normalization", () => {
	it("strips MediaRecorder codec parameters from webm uploads", async () => {
		const source = new Blob(["fake-audio"], { type: "audio/webm;codecs=opus" });

		const upload = normalizeSpeechAudioForUpload(source);

		expect(upload.filename).toBe("voice.webm");
		expect(upload.audio.type).toBe("audio/webm");
		expect(await upload.audio.text()).toBe("fake-audio");
	});

	it("uses an OpenAI-supported m4a filename for audio/mp4 recordings", () => {
		const source = new Blob(["fake-audio"], { type: "audio/mp4" });

		const upload = normalizeSpeechAudioForUpload(source);

		expect(upload.filename).toBe("voice.m4a");
		expect(upload.audio.type).toBe("audio/mp4");
	});
});

describe("chat image attachment send boundary", () => {
	beforeEach(() => {
		installLocalStorageMock();
		window.localStorage.clear();
		window.sessionStorage.clear();
		window.sessionStorage.setItem(sessionCookieReadyKey, "true");
	});

	afterEach(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("streams image-only messages with only backend-issued attachment ids", async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => streamDoneResponse());
		vi.stubGlobal("fetch", fetchMock);

		await streamChatMessage(
			"chat-1",
			"",
			[
				unsafeAttachmentInput({
					id: "attachment-1",
					kind: "image",
					previewUrl: "blob:local-preview",
					authenticatedPreviewUrl: "http://localhost:8080/api/chat/attachments/attachment-1/preview",
					localPath: "C:\\Users\\znnn\\Pictures\\local.png",
					fileUrl: "file:///C:/Users/znnn/Pictures/local.png",
					userImageUrl: "https://example.com/user-image.png",
					image_url: { url: "data:image/png;base64,raw-provider-payload" },
					bytes: [1, 2, 3],
					provider: "openai",
					model: "gpt-4.1-mini"
				})
			],
			{}
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0];
		expect(init?.method).toBe("POST");
		expect(init?.headers).toMatchObject({
			Accept: "text/event-stream",
			"Content-Type": "application/json"
		});
		expect(JSON.parse(init?.body as string)).toEqual({
			content: "",
			attachments: [{ id: "attachment-1", kind: "image" }]
		});
		expectSendBodyToExcludeUnsafeImagePayload(init?.body as string);
	});

	it("sends text plus image fallback messages with only backend-issued attachment ids", async () => {
		const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ data: { messages: [] } });

		await sendChatMessage("chat-1", "please describe this", [
			unsafeAttachmentInput({
				id: "attachment-2",
				kind: "image",
				previewUrl: "blob:text-image-preview",
				authenticatedPreviewUrl: "/api/chat/attachments/attachment-2/preview",
				localPath: "/home/user/Pictures/local.png",
				fileUrl: "file:///home/user/Pictures/local.png",
				userImageUrl: "https://example.com/not-allowed.png",
				image_url: { url: "data:image/png;base64,provider-specific" },
				rawBytes: "raw-image-bytes",
				provider: "xai",
				model: "grok-vision"
			})
		]);

		expect(postSpy).toHaveBeenCalledWith(
			"/api/chats/chat-1/messages",
			{
				content: "please describe this",
				attachments: [{ id: "attachment-2", kind: "image" }]
			}
		);
		const requestBody = JSON.stringify(postSpy.mock.calls[0][1]);
		expectSendBodyToExcludeUnsafeImagePayload(requestBody);
	});
});

function streamDoneResponse(): Response {
	return new Response(
		[
			"event: message_done",
			'data: {"chat_id":"chat-1","user_message":{"id":"user-1","role":"user","content":"","created_at":1780325400},"assistant_message":{"id":"assistant-1","role":"assistant","content":"ok","created_at":1780325401},"messages":[]}',
			"",
			""
		].join("\n"),
		{
			status: 200,
			headers: { "Content-Type": "text/event-stream" }
		}
	);
}

function installLocalStorageMock() {
	const store = new Map<string, string>();
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: {
			getItem: vi.fn((key: string) => store.get(key) ?? null),
			setItem: vi.fn((key: string, value: string) => {
				store.set(key, value);
			}),
			removeItem: vi.fn((key: string) => {
				store.delete(key);
			}),
			clear: vi.fn(() => {
				store.clear();
			})
		}
	});
}

function unsafeAttachmentInput<TAttachment extends { id: string; kind: "image" }>(attachment: TAttachment) {
	return attachment;
}

function expectSendBodyToExcludeUnsafeImagePayload(body: string) {
	expect(body).not.toContain("blob:");
	expect(body).not.toContain("previewUrl");
	expect(body).not.toContain("authenticatedPreviewUrl");
	expect(body).not.toContain("/preview");
	expect(body).not.toContain("localPath");
	expect(body).not.toContain("file://");
	expect(body).not.toContain("userImageUrl");
	expect(body).not.toContain("image_url");
	expect(body).not.toContain("rawBytes");
	expect(body).not.toContain("bytes");
	expect(body).not.toContain("provider");
	expect(body).not.toContain("model");
	expect(body).not.toContain("data:image/");
}
