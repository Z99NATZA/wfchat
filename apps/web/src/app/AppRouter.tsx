import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import PrivacyPage from "@/pages/PrivacyPage";

const App = lazy(() => import("@/app/App"));

function AppRouter() {
	return (
		<Routes>
			<Route path="/privacy" element={<PrivacyPage />} />
			<Route
				path="/*"
				element={
					<Suspense fallback={<div className="app-viewport bg-app-bg" />}>
						<App />
					</Suspense>
				}
			/>
		</Routes>
	);
}

export default AppRouter;
