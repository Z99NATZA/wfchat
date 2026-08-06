/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_BASE_URL?: string;
	readonly VITE_GOOGLE_CLIENT_ID?: string;
	readonly VITE_ENABLE_MARKDOWN_QA?: string;
	readonly VITE_ENABLE_STREAMING_SPEECH_PLAYBACK?: string;
}
