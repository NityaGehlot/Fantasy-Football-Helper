// app/backend/services/llm.ts
// Single place that talks to the local Ollama model. Override with OLLAMA_URL / OLLAMA_MODEL.
//
// Speed settings:
// - keep_alive keeps the model in memory between questions (Ollama unloads it after 5 min
//   by default, and reloading adds several seconds to the next answer).
// - num_ctx is large enough for the whole prompt; Ollama's 2048 default could cut off the
//   start of longer prompts, which is where the accuracy rules are.
// - num_predict caps answer length so a rambling answer can't take minutes.
// - A lower temperature keeps answers closer to the provided numbers.

import fetch from "node-fetch";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "mistral:latest";

export const LLM_OPTIONS = {
  temperature: 0.3,
  num_ctx: 6144,
  num_predict: 800,
};

function requestBody(prompt: string, stream: boolean, temperature?: number) {
  return JSON.stringify({
    model: OLLAMA_MODEL,
    prompt,
    stream,
    keep_alive: "30m",
    options: { ...LLM_OPTIONS, ...(temperature !== undefined ? { temperature } : {}) },
  });
}

export async function generateWithLLM(prompt: string, temperature?: number): Promise<string> {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody(prompt, false, temperature),
  });

  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { response?: string };
  return data.response ?? "";
}

/**
 * Stream the answer token by token. Ollama sends one JSON object per line:
 * {"response":"text","done":false}. Calls onToken for each piece and returns the full text.
 */
export async function streamWithLLM(prompt: string, onToken: (text: string) => void): Promise<string> {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody(prompt, true),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  }

  let full = "";
  let buffered = "";
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    try {
      const piece = JSON.parse(line)?.response ?? "";
      if (piece) {
        full += piece;
        onToken(piece);
      }
    } catch {
      // ignore a malformed line rather than failing the whole answer
    }
  };

  for await (const chunk of response.body as any as AsyncIterable<Buffer>) {
    buffered += chunk.toString("utf8");
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    lines.forEach(handleLine);
  }
  handleLine(buffered);
  return full;
}

/** Warm the model up so the first real question doesn't pay the load time. */
export async function warmUpLLM(): Promise<void> {
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt: "", keep_alive: "30m" }),
    });
  } catch {
    // Ollama isn't running; the chat route reports that when it's actually used.
  }
}
