export function formatMessageTime(date: Date): string {
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit"
	});
}

export function formatLocalDateKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function formatMessageDateLabel(date: Date, todayLabel: string, yesterdayLabel: string): string {
	const today = new Date();
	const yesterday = new Date();
	yesterday.setDate(today.getDate() - 1);
	const dateKey = formatLocalDateKey(date);

	if (dateKey === formatLocalDateKey(today)) {
		return todayLabel;
	}

	if (dateKey === formatLocalDateKey(yesterday)) {
		return yesterdayLabel;
	}

	return dateKey;
}
