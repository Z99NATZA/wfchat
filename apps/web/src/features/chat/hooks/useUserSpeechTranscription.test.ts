/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserSpeechTranscription } from "@/features/chat/hooks/useUserSpeechTranscription";
import { transcribeUserSpeech } from "@/features/chat/services/chatApiService";

vi.mock("@/features/chat/services/chatApiService", () => ({
	transcribeUserSpeech: vi.fn()
}));

const stoppedTracks: Array<ReturnType<typeof vi.fn>> = [];
const recordedAudioChunk = "fake-audio".repeat(160);

class FakeMediaRecorder extends EventTarget {
	static isTypeSupported = vi.fn(() => true);
	static nextChunk = new Blob([recordedAudioChunk], { type: "audio/webm;codecs=opus" });
	mimeType: string;
	state: RecordingState = "inactive";
	timeslice?: number;

	constructor(
		_stream: MediaStream,
		options: MediaRecorderOptions = {}
	) {
		super();
		this.mimeType = options.mimeType ?? "audio/webm";
	}

	start(timeslice?: number) {
		this.timeslice = timeslice;
		this.state = "recording";
	}

	stop() {
		if (this.state === "inactive") {
			return;
		}

		this.state = "inactive";
		const dataEvent = new Event("dataavailable") as Event & { data: Blob };
		Object.defineProperty(dataEvent, "data", {
			value: FakeMediaRecorder.nextChunk
		});
		this.dispatchEvent(dataEvent);
		this.dispatchEvent(new Event("stop"));
	}
}

describe("useUserSpeechTranscription", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		stoppedTracks.length = 0;
		FakeMediaRecorder.nextChunk = new Blob([recordedAudioChunk], { type: "audio/webm;codecs=opus" });
		vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: {
				getUserMedia: vi.fn(async () => {
					const stop = vi.fn();
					stoppedTracks.push(stop);
					return {
						getTracks: () => [{ stop }]
					} as unknown as MediaStream;
				})
			}
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("records audio, transcribes it, and returns the transcript", async () => {
		vi.mocked(transcribeUserSpeech).mockResolvedValue("hello from mic");
		const onTranscript = vi.fn();
		const { result } = renderHook(() => useUserSpeechTranscription(onTranscript));

		act(() => {
			result.current.toggleSpeechInput();
		});
		await waitFor(() => expect(result.current.speechInput.status).toBe("recording"));

		act(() => {
			result.current.toggleSpeechInput();
		});

		await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("hello from mic"));
		expect(result.current.speechInput.status).toBe("idle");
		expect(transcribeUserSpeech).toHaveBeenCalledWith(expect.any(Blob), {
			signal: expect.any(AbortSignal)
		});
		expect(stoppedTracks[0]).toHaveBeenCalled();
	});

	it("rejects header-only recordings without uploading audio", async () => {
		FakeMediaRecorder.nextChunk = new Blob([new Uint8Array(110)], { type: "audio/webm;codecs=opus" });
		const onTranscript = vi.fn();
		const { result } = renderHook(() => useUserSpeechTranscription(onTranscript));

		act(() => {
			result.current.toggleSpeechInput();
		});
		await waitFor(() => expect(result.current.speechInput.status).toBe("recording"));

		act(() => {
			result.current.toggleSpeechInput();
		});

		await waitFor(() =>
			expect(result.current.speechInput).toMatchObject({
				errorReason: "empty",
				status: "error"
			})
		);
		expect(transcribeUserSpeech).not.toHaveBeenCalled();
		expect(onTranscript).not.toHaveBeenCalled();
	});

	it("cancels recording without uploading audio", async () => {
		const onTranscript = vi.fn();
		const { result } = renderHook(() => useUserSpeechTranscription(onTranscript));

		act(() => {
			result.current.toggleSpeechInput();
		});
		await waitFor(() => expect(result.current.speechInput.status).toBe("recording"));

		act(() => {
			result.current.cancelSpeechInput();
		});

		expect(result.current.speechInput.status).toBe("idle");
		expect(transcribeUserSpeech).not.toHaveBeenCalled();
		expect(onTranscript).not.toHaveBeenCalled();
		expect(stoppedTracks[0]).toHaveBeenCalled();
	});

	it("shows an error when microphone permission fails", async () => {
		vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error("denied"));
		const { result } = renderHook(() => useUserSpeechTranscription(vi.fn()));

		act(() => {
			result.current.toggleSpeechInput();
		});

		await waitFor(() =>
			expect(result.current.speechInput).toMatchObject({
				errorReason: "permission",
				status: "error"
			})
		);
		expect(transcribeUserSpeech).not.toHaveBeenCalled();
	});

	it("shows an error when transcription upload fails", async () => {
		vi.mocked(transcribeUserSpeech).mockRejectedValue(new Error("provider failed"));
		const { result } = renderHook(() => useUserSpeechTranscription(vi.fn()));

		act(() => {
			result.current.toggleSpeechInput();
		});
		await waitFor(() => expect(result.current.speechInput.status).toBe("recording"));

		act(() => {
			result.current.toggleSpeechInput();
		});

		await waitFor(() =>
			expect(result.current.speechInput).toMatchObject({
				errorReason: "transcription",
				status: "error"
			})
		);
	});
});
