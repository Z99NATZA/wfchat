import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

export const apiClient = axios.create({
	baseURL: apiBaseUrl,
	withCredentials: true
});
