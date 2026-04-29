export interface Chunk {
  content: string;
  index: number;
}

export function chunkText(
  text: string,
  chunkSize: number,
  overlap: number
): Chunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push({ content: words.slice(start, end).join(" "), index });
    if (end === words.length) break;
    start += chunkSize - overlap;
    index++;
  }

  return chunks;
}
