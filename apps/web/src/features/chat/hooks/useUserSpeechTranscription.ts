import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeUserSpeech } from "@/features/chat/services/chatApiService";

const MIN_TRANSCRIPTION_AUDIO_BYTES = 1024;
const RECORDING_TIMESLICE_MS = 1000;

export type UserSpeechInputStatus = "idle" | "requesting" | "recording" | "transcribing" | "error";
export type UserSpeechInputErrorReason =
	"empty" | "permission" | "recording" | "transcription" | "unsupported";

export type UserSpeechInputState = {
	errorDetail?: string;
	errorReason?: UserSpeechInputErrorReason;
	status: UserSpeechInputStatus;
};

type RecordingResources = {
	abortController: AbortController | null;
	chunks: Blob[];
	recorder: MediaRecorder | null;
	startedAt: number;
	stream: MediaStream | null;
	shouldTranscribe: boolean;
	token: number;
};

export function useUserSpeechTranscription(onTranscript: (text: string) => void) {
	const resourcesRef = useRef<RecordingResources>({
		abortController: null,
		chunks: [],
		recorder: null,
		startedAt: 0,
		stream: null,
		shouldTranscribe: false,
		token: 0
	});
	const [speechInput, setSpeechInput] = useState<UserSpeechInputState>({ status: "idle" });
	const speechInputStatusRef = useRef<UserSpeechInputStatus>("idle");

	const setSpeechInputState = useCallback((nextSpeechInput: UserSpeechInputState) => {
		speechInputStatusRef.current = nextSpeechInput.status;
		setSpeechInput(nextSpeechInput);
	}, []);

	const releaseStream = useCallback(() => {
		const resources = resourcesRef.current;
		resources.stream?.getTracks().forEach((track) => track.stop());
		resources.stream = null;
		resources.recorder = null;
		resources.chunks = [];
		resources.startedAt = 0;
	}, []);

	const cancelSpeechInput = useCallback(() => {
		const resources = resourcesRef.current;
		resources.token += 1;
		resources.shouldTranscribe = false;
		resources.abortController?.abort();
		resources.abortController = null;

		if (resources.recorder && resources.recorder.state !== "inactive") {
			resources.recorder.stop();
		}

		releaseStream();
		setSpeechInputState({ status: "idle" });
	}, [releaseStream, setSpeechInputState]);

	const handleRecordingStopped = useCallback(
		async (token: number, recorder: MediaRecorder) => {
			const resources = resourcesRef.current;
			if (resources.token !== token || !resources.shouldTranscribe) {
				return;
			}

			const chunks = resources.chunks;
			const mimeType = chunks[0]?.type || recorder.mimeType || "audio/webm";
			const audio = new Blob(chunks, { type: mimeType });
			releaseStream();

			if (chunks.length === 0 || audio.size < MIN_TRANSCRIPTION_AUDIO_BYTES) {
				setSpeechInputState({ errorReason: "empty", status: "error" });
				return;
			}

			setSpeechInputState({ status: "transcribing" });
			const abortController = new AbortController();
			resourcesRef.current.abortController = abortController;

			try {
				const text = await transcribeUserSpeech(audio, {
					signal: abortController.signal
				});

				if (resourcesRef.current.token !== token) {
					return;
				}

				resourcesRef.current.abortController = null;
				onTranscript(text);
				setSpeechInputState({ status: "idle" });
			} catch (error) {
				if (resourcesRef.current.token !== token) {
					return;
				}

				resourcesRef.current.abortController = null;
				if (error instanceof DOMException && error.name === "AbortError") {
					setSpeechInputState({ status: "idle" });
					return;
				}

				const errorDetail = describeSpeechInputError(error);
				console.warn("Voice transcription failed", error);
				setSpeechInputState({ errorDetail, errorReason: "transcription", status: "error" });
			}
		},
		[onTranscript, releaseStream, setSpeechInputState]
	);

	const startSpeechInput = useCallback(async () => {
		const currentStatus = speechInputStatusRef.current;
		if (
			currentStatus === "requesting" ||
			currentStatus === "recording" ||
			currentStatus === "transcribing"
		) {
			return;
		}

		if (
			typeof navigator === "undefined" ||
			!navigator.mediaDevices?.getUserMedia ||
			typeof MediaRecorder === "undefined"
		) {
			setSpeechInputState({ errorReason: "unsupported", status: "error" });
			return;
		}

		const nextToken = resourcesRef.current.token + 1;
		resourcesRef.current.token = nextToken;
		resourcesRef.current.shouldTranscribe = false;
		resourcesRef.current.chunks = [];
		setSpeechInputState({ status: "requesting" });

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			if (resourcesRef.current.token !== nextToken) {
				stream.getTracks().forEach((track) => track.stop());
				return;
			}

			const mimeType = preferredRecordingMimeType();
			const recorder = mimeType
				? new MediaRecorder(stream, { mimeType })
				: new MediaRecorder(stream);
			resourcesRef.current.stream = stream;
			resourcesRef.current.recorder = recorder;
			resourcesRef.current.chunks = [];
			resourcesRef.current.startedAt = Date.now();

			recorder.addEventListener("dataavailable", (event) => {
				if (event.data.size > 0) {
					resourcesRef.current.chunks.push(event.data);
				}
			});
			recorder.addEventListener("error", () => {
				if (resourcesRef.current.token !== nextToken) {
					return;
				}

				resourcesRef.current.token += 1;
				releaseStream();
				setSpeechInputState({
					errorDetail: "MediaRecorder emitted an error event",
					errorReason: "recording",
					status: "error"
				});
			});
			recorder.addEventListener("stop", () => {
				void handleRecordingStopped(nextToken, recorder);
			});

			recorder.start(RECORDING_TIMESLICE_MS);
			setSpeechInputState({ status: "recording" });
		} catch (error) {
			if (resourcesRef.current.token === nextToken) {
				releaseStream();
				const errorDetail = describeSpeechInputError(error);
				console.warn("Microphone permission or device access failed", error);
				setSpeechInputState({ errorDetail, errorReason: "permission", status: "error" });
			}
		}
	}, [handleRecordingStopped, releaseStream, setSpeechInputState]);

	const stopAndTranscribeSpeechInput = useCallback(() => {
		const resources = resourcesRef.current;
		if (!resources.recorder || resources.recorder.state === "inactive") {
			return;
		}

		resources.shouldTranscribe = true;
		setSpeechInputState({ status: "transcribing" });
		try {
			resources.recorder.requestData();
		} catch {
			// Some browser implementations reject requestData close to stop; stop still flushes final data.
		}
		resources.recorder.stop();
	}, [setSpeechInputState]);

	const toggleSpeechInput = useCallback(() => {
		const currentStatus = speechInputStatusRef.current;
		if (currentStatus === "recording") {
			stopAndTranscribeSpeechInput();
			return;
		}

		if (currentStatus === "requesting" || currentStatus === "transcribing") {
			return;
		}

		void startSpeechInput();
	}, [startSpeechInput, stopAndTranscribeSpeechInput]);

	useEffect(() => cancelSpeechInput, [cancelSpeechInput]);

	return {
		cancelSpeechInput,
		speechInput,
		toggleSpeechInput
	};
}

function describeSpeechInputError(error: unknown): string | undefined {
	if (error instanceof DOMException) {
		return error.message ? `${error.name}: ${error.message}` : error.name;
	}

	if (error instanceof Error) {
		return error.message ? `${error.name}: ${error.message}` : error.name;
	}

	return undefined;
}

function preferredRecordingMimeType(): string | undefined {
	const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/wav"];

	if (typeof MediaRecorder.isTypeSupported !== "function") {
		return undefined;
	}

	return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}
