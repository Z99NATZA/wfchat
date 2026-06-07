import ChatPage from "@/pages/ChatPage";
import Model3DPage from "@/pages/Model3DPage";
import ActivityBar from "@/components/navigation/ActivityBar";
import DialogProvider from "@/components/dialog/DialogProvider";
import { useTheme } from "@/hooks/useTheme";
import { useFont } from "@/hooks/useFont";
import { Navigate, Route, Routes } from "react-router-dom";

function App() {
	const { theme, toggleTheme } = useTheme();
	const { font, setFont } = useFont();
	const activityBar = <ActivityBar />;
	const chatPage = (
		<ChatPage
			activityBar={activityBar}
			theme={theme}
			font={font}
			onFontChange={setFont}
			onToggleTheme={toggleTheme}
		/>
	);

	return (
		<DialogProvider>
			<Routes>
				<Route path="/" element={<Navigate to="/chat" replace />} />
				<Route path="/chat" element={chatPage} />
				<Route path="/chat/:chatId" element={chatPage} />
				<Route path="/model3d" element={<Model3DPage activityBar={activityBar} />} />
				<Route path="*" element={<Navigate to="/chat" replace />} />
			</Routes>
		</DialogProvider>
	);
}

export default App;
