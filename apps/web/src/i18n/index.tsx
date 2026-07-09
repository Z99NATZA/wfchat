import { type ReactNode, useMemo, useState } from "react";
import {
	getStoredLocale,
	I18nContext,
	translate,
	writeLocale,
	type I18nContextValue,
	type Locale
} from "@/i18n/i18nContext";
import { touchSyncKey } from "@/stores/syncStateStore";

type I18nProviderProps = {
	children: ReactNode;
};

export function I18nProvider({ children }: I18nProviderProps) {
	const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale());

	function setLocale(nextLocale: Locale) {
		setLocaleState(nextLocale);
		writeLocale(nextLocale);
		touchSyncKey("settings.locale");
	}

	function applyPulledLocale(nextLocale: Locale) {
		setLocaleState(nextLocale);
		writeLocale(nextLocale);
	}

	const value = useMemo<I18nContextValue>(
		() => ({
			locale,
			setLocale,
			applyPulledLocale,
			t: (key, params) => translate(locale, key, params)
		}),
		[locale]
	);

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
