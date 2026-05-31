import ChatPage from "@/pages/ChatPage";
import DialogProvider from "@/components/dialog/DialogProvider";
import { useTheme } from "@/hooks/useTheme";
import { useFont } from "@/hooks/useFont";

function App() {
	const { theme, toggleTheme } = useTheme();
	const { font, setFont } = useFont();

	return (
		<DialogProvider>
			<ChatPage theme={theme} font={font} onFontChange={setFont} onToggleTheme={toggleTheme} />
		</DialogProvider>
	);
}

export default App;
