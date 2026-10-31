// app/backend/services/llm.ts
// Single place that talks to the local Ollama model. Override with OLLAMA_URL / OLLAMA_MODEL.

import fetch from "node-fetch";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "mistral:latest";

export async function generateWithLLM(prompt: string, temperature = 0.6): Promise<string> {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { temperature } }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { response?: string };
  return data.response ?? "";
}
