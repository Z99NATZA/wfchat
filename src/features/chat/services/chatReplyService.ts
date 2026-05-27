const defaultReply =
	"I can shape that into a softer reply. Keep the intent clear, add one warm detail, and close with a question that invites them in.";

const replyPatterns = [
	{
		match: "sweet",
		reply: "I would make it sweeter by softening the first sentence, then keeping the final ask simple and sincere."
	},
	{
		match: "banter",
		reply: "Add one playful tease, then give them an easy way to answer. Warm banter works best when it still feels generous."
	},
	{
		match: "memory",
		reply: "Saved as a preference: concise, cozy, and emotionally clear replies should be the default tone."
	}
];

export function buildCompanionReply(userInput: string): string {
	const normalizedInput = userInput.toLowerCase();
	const matchedPattern = replyPatterns.find((pattern) => normalizedInput.includes(pattern.match));

	return matchedPattern?.reply ?? defaultReply;
}
