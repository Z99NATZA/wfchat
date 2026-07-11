import { apiClient } from "@/services/apiClient";
import { ensureCookieSession } from "@/services/sessionService";

export async function resetLearnedContext(): Promise<void> {
	await ensureCookieSession();
	await apiClient.delete("/api/learned-context");
}
