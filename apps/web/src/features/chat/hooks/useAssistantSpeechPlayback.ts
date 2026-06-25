import { useCallback, useEffect, useRef, useState } from "react";
import {
	fetchAssistantMessageSpeech,
	getAssistantMessageSpeech
} from "@/features/chat/services/chatApiService";

export type AssistantSpeechPlaybackStatus = "idle" | "loading" | "playing" | "error";

export type AssistantSpeechPlaybackState = {
	messageId: string | null;
	status: AssistantSpeechPlaybackStatus;
};

type PlaybackResources = {
	abortController: AbortController | null;
	audio: HTMLAudioElement | null;
	objectUrl: string | null;
	token: number;
};

export function useAssistantSpeechPlayback(activeChatId: string | null) {
	const audioCacheRef = useRef<Map<string, Blob>>(new Map());
	const resourcesRef = useRef<PlaybackResources>({
		abortController: null,
		audio: null,
		objectUrl: null,
		token: 0
	});
	const [playback, setPlayback] = useState<AssistantSpeechPlaybackState>({
		messageId: null,
		status: "idle"
	});

	const releaseResources = useCallback(() => {
		const resources = resourcesRef.current;

		resources.abortController?.abort();
		resources.abortController = null;

		if (resources.audio) {
			resources.audio.pause();
			resources.audio.src = "";
			resources.audio = null;
		}

		if (resources.objectUrl) {
			URL.revokeObjectURL(resources.objectUrl);
			resources.objectUrl = null;
		}
	}, []);

	const stopAssistantSpeech = useCallback(() => {
		resourcesRef.current.token += 1;
		releaseResources();
		setPlayback({ messageId: null, status: "idle" });
	}, [releaseResources]);

	const registerAudio = useCallback(
		(audio: HTMLAudioElement, objectUrl: string, messageId: string, cacheKey: string, token: number) => {
			resourcesRef.current.objectUrl = objectUrl;
			resourcesRef.current.audio = audio;

			audio.addEventListener("ended", () => {
				if (resourcesRef.current.token !== token) {
					return;
				}

				resourcesRef.current.token += 1;
				releaseResources();
				setPlayback({ messageId: null, status: "idle" });
			});
			audio.addEventListener("error", () => {
				if (resourcesRef.current.token !== token) {
					return;
				}

				audioCacheRef.current.delete(cacheKey);
				releaseResources();
				setPlayback({ messageId, status: "error" });
			});
		},
		[releaseResources]
	);

	const startAudio = useCallback(
		async (audio: HTMLAudioElement, objectUrl: string, messageId: string, cacheKey: string, token: number) => {
			registerAudio(audio, objectUrl, messageId, cacheKey, token);
			await audio.play();

			if (resourcesRef.current.token === token) {
				setPlayback({ messageId, status: "playing" });
			}
		},
		[registerAudio]
	);

	const playBlob = useCallback(
		async (audioBlob: Blob, messageId: string, cacheKey: string, token: number) => {
			const objectUrl = URL.createObjectURL(audioBlob);
			const audio = new Audio(objectUrl);
			await startAudio(audio, objectUrl, messageId, cacheKey, token);
		},
		[startAudio]
	);

	const playAssistantSpeech = useCallback(
		async (chatId: string, messageId: string) => {
			const nextToken = resourcesRef.current.token + 1;
			const cacheKey = assistantSpeechCacheKey(chatId, messageId);
			resourcesRef.current.token = nextToken;
			releaseResources();

			setPlayback({ messageId, status: "loading" });

			try {
				let audioBlob = audioCacheRef.current.get(cacheKey);

				if (!audioBlob) {
					const abortController = new AbortController();
					resourcesRef.current.abortController = abortController;
					if (canAttemptMediaSourcePlayback()) {
						audioBlob = await streamAndPlayAssistantSpeech({
							abortSignal: abortController.signal,
							cacheKey,
							chatId,
							messageId,
							playBlob,
							registerAudio,
							setPlaying: () => {
								if (resourcesRef.current.token === nextToken) {
									setPlayback({ messageId, status: "playing" });
								}
							},
							token: nextToken
						});
					} else {
						audioBlob = await getAssistantMessageSpeech(chatId, messageId, {
							signal: abortController.signal
						});
					}

					if (resourcesRef.current.token !== nextToken) {
						return;
					}

					audioCacheRef.current.set(cacheKey, audioBlob);
					resourcesRef.current.abortController = null;
					if (canAttemptMediaSourcePlayback()) {
						return;
					}
				}

				if (resourcesRef.current.token !== nextToken) {
					return;
				}

				await playBlob(audioBlob, messageId, cacheKey, nextToken);
			} catch (error) {
				if (resourcesRef.current.token !== nextToken) {
					return;
				}

				audioCacheRef.current.delete(cacheKey);
				releaseResources();
				if (error instanceof DOMException && error.name === "AbortError") {
					setPlayback({ messageId: null, status: "idle" });
					return;
				}

				setPlayback({ messageId, status: "error" });
			}
		},
		[playBlob, registerAudio, releaseResources]
	);

	const toggleAssistantSpeech = useCallback(
		(messageId: string) => {
			if (!activeChatId) {
				return;
			}

			if (
				playback.messageId === messageId &&
				(playback.status === "loading" || playback.status === "playing")
			) {
				stopAssistantSpeech();
				return;
			}

			void playAssistantSpeech(activeChatId, messageId);
		},
		[activeChatId, playAssistantSpeech, playback.messageId, playback.status, stopAssistantSpeech]
	);

	useEffect(() => {
		stopAssistantSpeech();
	}, [activeChatId, stopAssistantSpeech]);

	useEffect(() => stopAssistantSpeech, [stopAssistantSpeech]);

	return {
		playback,
		stopAssistantSpeech,
		toggleAssistantSpeech
	};
}

function assistantSpeechCacheKey(chatId: string, messageId: string): string {
	return `${chatId}:${messageId}`;
}

type StreamAndPlayAssistantSpeechOptions = {
	abortSignal: AbortSignal;
	cacheKey: string;
	chatId: string;
	messageId: string;
	playBlob: (audioBlob: Blob, messageId: string, cacheKey: string, token: number) => Promise<void>;
	registerAudio: (
		audio: HTMLAudioElement,
		objectUrl: string,
		messageId: string,
		cacheKey: string,
		token: number
	) => void;
	setPlaying: () => void;
	token: number;
};

async function streamAndPlayAssistantSpeech({
	abortSignal,
	cacheKey,
	chatId,
	messageId,
	playBlob,
	registerAudio,
	setPlaying,
	token
}: StreamAndPlayAssistantSpeechOptions): Promise<Blob> {
	const response = await fetchAssistantMessageSpeech(chatId, messageId, { signal: abortSignal });
	const contentType = normalizedAudioContentType(response.headers.get("Content-Type"));

	if (!response.body || !contentType || !canUseMediaSource(contentType)) {
		const audioBlob = await response.blob();
		await playBlob(audioBlob, messageId, cacheKey, token);
		return audioBlob;
	}

	const mediaSource = new MediaSource();
	const objectUrl = URL.createObjectURL(mediaSource);
	const audio = new Audio(objectUrl);
	registerAudio(audio, objectUrl, messageId, cacheKey, token);

	await waitForMediaSourceOpen(mediaSource, abortSignal);
	const sourceBuffer = mediaSource.addSourceBuffer(contentType);
	const reader = response.body.getReader();
	const chunks: ArrayBuffer[] = [];
	let didStartPlayback = false;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			if (!value?.byteLength) {
				continue;
			}

			const chunk = copyChunkToArrayBuffer(value);
			chunks.push(chunk);
			await appendSourceBuffer(sourceBuffer, chunk, abortSignal);

			if (!didStartPlayback) {
				didStartPlayback = true;
				await audio.play();
				setPlaying();
			}
		}

		if (!chunks.length) {
			throw new Error("speech response did not include audio");
		}

		await endMediaSource(mediaSource, sourceBuffer, abortSignal);
		return new Blob(chunks, { type: contentType });
	} catch (error) {
		await reader.cancel().catch(() => undefined);
		throw error;
	}
}

function canAttemptMediaSourcePlayback(): boolean {
	return typeof MediaSource !== "undefined";
}

function canUseMediaSource(contentType: string): boolean {
	return (
		typeof MediaSource !== "undefined" &&
		typeof MediaSource.isTypeSupported === "function" &&
		MediaSource.isTypeSupported(contentType)
	);
}

function normalizedAudioContentType(contentType: string | null): string | undefined {
	return contentType?.split(";")[0]?.trim().toLowerCase() || undefined;
}

function waitForMediaSourceOpen(mediaSource: MediaSource, abortSignal: AbortSignal): Promise<void> {
	if (mediaSource.readyState === "open") {
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		const cleanup = () => {
			mediaSource.removeEventListener("sourceopen", handleOpen);
			mediaSource.removeEventListener("error", handleError);
			abortSignal.removeEventListener("abort", handleAbort);
		};
		const handleOpen = () => {
			cleanup();
			resolve();
		};
		const handleError = () => {
			cleanup();
			reject(new Error("speech media source failed"));
		};
		const handleAbort = () => {
			cleanup();
			reject(new DOMException("aborted", "AbortError"));
		};

		mediaSource.addEventListener("sourceopen", handleOpen, { once: true });
		mediaSource.addEventListener("error", handleError, { once: true });
		abortSignal.addEventListener("abort", handleAbort, { once: true });
	});
}

function appendSourceBuffer(
	sourceBuffer: SourceBuffer,
	chunk: ArrayBuffer,
	abortSignal: AbortSignal
): Promise<void> {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			sourceBuffer.removeEventListener("updateend", handleUpdateEnd);
			sourceBuffer.removeEventListener("error", handleError);
			abortSignal.removeEventListener("abort", handleAbort);
		};
		const handleUpdateEnd = () => {
			cleanup();
			resolve();
		};
		const handleError = () => {
			cleanup();
			reject(new Error("speech audio buffer failed"));
		};
		const handleAbort = () => {
			cleanup();
			reject(new DOMException("aborted", "AbortError"));
		};

		sourceBuffer.addEventListener("updateend", handleUpdateEnd, { once: true });
		sourceBuffer.addEventListener("error", handleError, { once: true });
		abortSignal.addEventListener("abort", handleAbort, { once: true });

		try {
			sourceBuffer.appendBuffer(chunk);
		} catch (error) {
			cleanup();
			reject(error);
		}
	});
}

function copyChunkToArrayBuffer(chunk: Uint8Array): ArrayBuffer {
	return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
}

async function endMediaSource(
	mediaSource: MediaSource,
	sourceBuffer: SourceBuffer,
	abortSignal: AbortSignal
): Promise<void> {
	if (sourceBuffer.updating) {
		await new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				sourceBuffer.removeEventListener("updateend", handleUpdateEnd);
				sourceBuffer.removeEventListener("error", handleError);
				abortSignal.removeEventListener("abort", handleAbort);
			};
			const handleUpdateEnd = () => {
				cleanup();
				resolve();
			};
			const handleError = () => {
				cleanup();
				reject(new Error("speech audio buffer failed"));
			};
			const handleAbort = () => {
				cleanup();
				reject(new DOMException("aborted", "AbortError"));
			};

			sourceBuffer.addEventListener("updateend", handleUpdateEnd, { once: true });
			sourceBuffer.addEventListener("error", handleError, { once: true });
			abortSignal.addEventListener("abort", handleAbort, { once: true });
		});
	}

	if (mediaSource.readyState === "open") {
		mediaSource.endOfStream();
	}
}
