/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	fetchAssistantMessageSpeech,
	getAssistantMessageSpeech
} from "@/features/chat/services/chatApiService";
import { useAssistantSpeechPlayback } from "@/features/chat/hooks/useAssistantSpeechPlayback";

vi.mock("@/features/chat/services/chatApiService", () => ({
	fetchAssistantMessageSpeech: vi.fn(),
	getAssistantMessageSpeech: vi.fn()
}));

class MockAudio {
	src: string;
	play = vi.fn(() => Promise.resolve());
	pause = vi.fn();
	private listeners = new Map<string, Array<() => void>>();

	constructor(src: string) {
		this.src = src;
		audioInstances.push(this);
	}

	addEventListener(eventName: string, listener: () => void) {
		const listeners = this.listeners.get(eventName) ?? [];
		listeners.push(listener);
		this.listeners.set(eventName, listeners);
	}

	emit(eventName: string) {
		for (const listener of this.listeners.get(eventName) ?? []) {
			listener();
		}
	}
}

const audioInstances: MockAudio[] = [];

describe("useAssistantSpeechPlayback", () => {
	beforeEach(() => {
		audioInstances.length = 0;
		vi.clearAllMocks();
		vi.stubGlobal("Audio", MockAudio);
		vi.spyOn(URL, "createObjectURL").mockImplementation(
			(object) => `blob:${object instanceof Blob ? object.size : 0}:${audioInstances.length}`
		);
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("reuses cached speech audio when replaying the same assistant message", async () => {
		vi.mocked(getAssistantMessageSpeech).mockResolvedValue(new Blob(["audio-one"]));
		const { result } = renderHook(() => useAssistantSpeechPlayback("chat-1"));

		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.playback.status).toBe("playing"));

		await act(async () => {
			result.current.stopAssistantSpeech();
		});
		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.playback.status).toBe("playing"));

		expect(getAssistantMessageSpeech).toHaveBeenCalledTimes(1);
		expect(audioInstances).toHaveLength(2);
		expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
	});

	it("streams uncached speech audio through MediaSource when supported", async () => {
		class MockSourceBuffer extends EventTarget {
			updating = false;

			appendBuffer(_chunk: Uint8Array) {
				this.updating = true;
				queueMicrotask(() => {
					this.updating = false;
					this.dispatchEvent(new Event("updateend"));
				});
			}
		}
		class MockMediaSource extends EventTarget {
			static isTypeSupported = vi.fn((contentType: string) => contentType === "audio/mpeg");
			readyState: "closed" | "open" | "ended" = "closed";
			sourceBuffer = new MockSourceBuffer();

			constructor() {
				super();
				queueMicrotask(() => {
					this.readyState = "open";
					this.dispatchEvent(new Event("sourceopen"));
				});
			}

			addSourceBuffer() {
				return this.sourceBuffer;
			}

			endOfStream() {
				this.readyState = "ended";
			}
		}
		vi.stubGlobal("MediaSource", MockMediaSource);
		vi.mocked(fetchAssistantMessageSpeech).mockResolvedValue(
			new Response(new Blob(["audio-one"], { type: "audio/mpeg" }), {
				headers: { "Content-Type": "audio/mpeg" }
			})
		);
		const { result } = renderHook(() => useAssistantSpeechPlayback("chat-1"));

		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.playback.status).toBe("playing"));
		await waitFor(() => expect(fetchAssistantMessageSpeech).toHaveBeenCalledTimes(1));

		await act(async () => {
			result.current.stopAssistantSpeech();
		});
		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.playback.status).toBe("playing"));

		expect(fetchAssistantMessageSpeech).toHaveBeenCalledTimes(1);
		expect(getAssistantMessageSpeech).not.toHaveBeenCalled();
		expect(audioInstances).toHaveLength(2);
	});

	it("does not reuse cached speech audio across different chats", async () => {
		vi.mocked(getAssistantMessageSpeech).mockResolvedValue(new Blob(["audio-one"]));
		const { result, rerender } = renderHook(
			({ chatId }: { chatId: string }) => useAssistantSpeechPlayback(chatId),
			{ initialProps: { chatId: "chat-1" } }
		);

		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.playback.status).toBe("playing"));

		rerender({ chatId: "chat-2" });
		await waitFor(() => expect(result.current.playback.status).toBe("idle"));

		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.playback.status).toBe("playing"));

		expect(getAssistantMessageSpeech).toHaveBeenCalledTimes(2);
		expect(getAssistantMessageSpeech).toHaveBeenNthCalledWith(
			1,
			"chat-1",
			"assistant-1",
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
		expect(getAssistantMessageSpeech).toHaveBeenNthCalledWith(
			2,
			"chat-2",
			"assistant-1",
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
	});

	it("does not cache failed speech requests", async () => {
		vi.mocked(getAssistantMessageSpeech)
			.mockRejectedValueOnce(new Error("speech failed"))
			.mockResolvedValueOnce(new Blob(["audio-after-retry"]));
		const { result } = renderHook(() => useAssistantSpeechPlayback("chat-1"));

		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.playback.status).toBe("error"));

		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.playback.status).toBe("playing"));

		expect(getAssistantMessageSpeech).toHaveBeenCalledTimes(2);
	});

	it("does not cache aborted speech requests", async () => {
		vi.mocked(getAssistantMessageSpeech)
			.mockImplementationOnce((_chatId, _messageId, options) => {
				return new Promise<Blob>((_resolve, reject) => {
					options?.signal?.addEventListener("abort", () => {
						reject(new DOMException("aborted", "AbortError"));
					});
				});
			})
			.mockResolvedValueOnce(new Blob(["audio-after-abort"]));
		const { result } = renderHook(() => useAssistantSpeechPlayback("chat-1"));

		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.playback.status).toBe("loading"));

		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.playback.status).toBe("idle"));

		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.playback.status).toBe("playing"));

		expect(getAssistantMessageSpeech).toHaveBeenCalledTimes(2);
	});

	it("does not show an error when cleanup after ended emits an audio error event", async () => {
		vi.mocked(getAssistantMessageSpeech).mockResolvedValue(new Blob(["audio-one"]));
		const { result } = renderHook(() => useAssistantSpeechPlayback("chat-1"));

		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.playback.status).toBe("playing"));

		await act(async () => {
			audioInstances[0].emit("ended");
			audioInstances[0].emit("error");
		});

		expect(result.current.playback).toEqual({ messageId: null, status: "idle" });
	});
});
