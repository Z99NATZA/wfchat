import ChatPage from "@/pages/ChatPage";
import Model3DPage from "@/pages/Model3DPage";
import ActivityBar, { type AppPageId } from "@/components/navigation/ActivityBar";
import DialogProvider from "@/components/dialog/DialogProvider";
import { useTheme } from "@/hooks/useTheme";
import { useFont } from "@/hooks/useFont";
import { useState } from "react";

function App() {
	const { theme, toggleTheme } = useTheme();
	const { font, setFont } = useFont();
	const [activePage, setActivePage] = useState<AppPageId>("chat");
	const activityBar = <ActivityBar activePage={activePage} onSelectPage={setActivePage} />;

	return (
		<DialogProvider>
			{activePage === "chat" ? (
				<ChatPage
					activityBar={activityBar}
					theme={theme}
					font={font}
					onFontChange={setFont}
					onToggleTheme={toggleTheme}
				/>
			) : (
				<Model3DPage activityBar={activityBar} />
			)}
		</DialogProvider>
	);
}

export default App;
