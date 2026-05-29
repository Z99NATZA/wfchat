import ChatPage from "@/pages/ChatPage";
import DialogProvider from "@/components/dialog/DialogProvider";
import { useTheme } from "@/hooks/useTheme";

function App() {
	const { theme, toggleTheme } = useTheme();

	return (
		<DialogProvider>
			<ChatPage theme={theme} onToggleTheme={toggleTheme} />
		</DialogProvider>
	);
}

export default App;
