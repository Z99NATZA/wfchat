import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AppRouter from "@/app/AppRouter";
import { AppSettingsProvider } from "@/app/AppSettingsProvider";
import { I18nProvider } from "@/i18n";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<I18nProvider>
				<AppSettingsProvider>
					<AppRouter />
				</AppSettingsProvider>
			</I18nProvider>
		</BrowserRouter>
	</StrictMode>
);
