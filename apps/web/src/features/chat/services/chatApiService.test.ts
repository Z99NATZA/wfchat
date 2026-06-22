import { describe, expect, it } from "vitest";
import {
	createSseEventParser,
	normalizeSpeechAudioForUpload,
	type ParsedSseEvent
} from "@/features/chat/services/chatApiService";

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
