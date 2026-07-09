import { createContext, useContext } from "react";
import en from "@/i18n/locales/en.json";
import th from "@/i18n/locales/th.json";
import { readStorageItem, writeStorageItem } from "@/services/storageService";

const LOCALE_STORAGE_KEY = "wfchat.locale";

const dictionaries = {
	en,
	th
} as const;

export type Locale = keyof typeof dictionaries;
export const SUPPORTED_LOCALES: ReadonlyArray<{ code: Locale; label: string }> = [
	{ code: "en", label: "English" },
	{ code: "th", label: "ไทย" }
];
export type TranslationParams = Record<string, string | number>;

export type I18nContextValue = {
	locale: Locale;
	setLocale: (locale: Locale) => void;
	applyPulledLocale: (locale: Locale) => void;
	t: (key: string, params?: TranslationParams) => string;
};

export const I18nContext = createContext<I18nContextValue | null>(null);

export function getStoredLocale(): Locale {
	const savedLocale = readStorageItem(LOCALE_STORAGE_KEY);
	return savedLocale === "th" || savedLocale === "en" ? savedLocale : "en";
}

export function writeLocale(locale: Locale): void {
	writeStorageItem(LOCALE_STORAGE_KEY, locale);
}

export function translate(locale: Locale, key: string, params?: TranslationParams) {
	const baseDictionary = dictionaries.en as Record<string, string>;
	const activeDictionary = dictionaries[locale] as Record<string, string>;
	const template = activeDictionary[key] ?? baseDictionary[key] ?? key;

	if (!params) {
		return template;
	}

	return Object.entries(params).reduce(
		(result, [paramKey, value]) => result.replaceAll(`{${paramKey}}`, String(value)),
		template
	);
}

export function useI18n() {
	const context = useContext(I18nContext);

	if (!context) {
		throw new Error("useI18n must be used within I18nProvider");
	}

	return context;
}
