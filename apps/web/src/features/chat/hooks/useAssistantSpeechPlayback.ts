import { useCallback, useEffect, useRef, useState } from "react";
import { getAssistantMessageSpeech } from "@/features/chat/services/chatApiService";

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
					audioBlob = await getAssistantMessageSpeech(chatId, messageId, {
						signal: abortController.signal
					});

					if (resourcesRef.current.token !== nextToken) {
						return;
					}

					audioCacheRef.current.set(cacheKey, audioBlob);
					resourcesRef.current.abortController = null;
				}

				if (resourcesRef.current.token !== nextToken) {
					return;
				}

				const objectUrl = URL.createObjectURL(audioBlob);
				const audio = new Audio(objectUrl);
				resourcesRef.current.objectUrl = objectUrl;
				resourcesRef.current.audio = audio;
				resourcesRef.current.abortController = null;

				audio.addEventListener("ended", () => {
					if (resourcesRef.current.token !== nextToken) {
						return;
					}

					releaseResources();
					setPlayback({ messageId: null, status: "idle" });
				});
				audio.addEventListener("error", () => {
					if (resourcesRef.current.token !== nextToken) {
						return;
					}

					audioCacheRef.current.delete(cacheKey);
					releaseResources();
					setPlayback({ messageId, status: "error" });
				});

				await audio.play();

				if (resourcesRef.current.token === nextToken) {
					setPlayback({ messageId, status: "playing" });
				}
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
		[releaseResources]
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
