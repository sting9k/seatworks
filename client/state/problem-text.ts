/** What a failed call says to the Human: its error's message, or the value as text. */
export const problemText = (problem: unknown): string => (problem instanceof Error ? problem.message : String(problem));
