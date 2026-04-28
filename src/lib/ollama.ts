import type { Config } from "./config.js";

export async function getEmbedding(
  text: string,
  config: Config
): Promise<number[] | null> {
  try {
    const res = await fetch(`${config.ollama_url}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.embedding_model, prompt: text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding;
  } catch {
    return null;
  }
}

export async function isOllamaAvailable(config: Config): Promise<boolean> {
  try {
    const res = await fetch(`${config.ollama_url}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
