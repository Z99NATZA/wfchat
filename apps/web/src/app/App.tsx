import ChatPage from "@/pages/ChatPage";
import { useTheme } from "@/hooks/useTheme";

function App() {
	const { theme, toggleTheme } = useTheme();

	return <ChatPage theme={theme} onToggleTheme={toggleTheme} />;
}

export default App;
