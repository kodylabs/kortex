/**
 * Note authorship marker.
 *
 * Stored in markdown frontmatter as `author: <value>`. An absent or unknown
 * value is treated as Human — this is the safe default for any pre-existing
 * note in the vault. The agent only ever writes NoteAuthor.Agent.
 */
export enum NoteAuthor {
  Agent = "agent",
  Human = "human",
}

export function parseAuthor(value: unknown): NoteAuthor {
  return value === NoteAuthor.Agent ? NoteAuthor.Agent : NoteAuthor.Human;
}
