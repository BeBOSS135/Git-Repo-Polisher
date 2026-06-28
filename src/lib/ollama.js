// Local Ollama client — talks to http://localhost:11434, no internet, no cost.
// Browser usage requires Ollama to allow the origin:
//   set OLLAMA_ORIGINS=* (or the Vite dev origin) before `ollama serve`.

// In the browser, go through the Vite proxy (/ollama) to avoid CORS.
// In Node (test scripts) hit Ollama directly.
const HOST = typeof window !== 'undefined' ? '/ollama' : 'http://localhost:11434';

/** True if Ollama is running and reachable. */
export async function isUp() {
  try {
    const res = await fetch(`${HOST}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

/** List locally available model names (e.g. ["mistral:latest"]). */
export async function listModels() {
  const res = await fetch(`${HOST}/api/tags`);
  if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m) => m.name);
}

/**
 * Single-shot generation (stream: false).
 * @param {string} prompt
 * @param {{ model?: string, system?: string, temperature?: number }} opts
 * @returns {Promise<string>}
 */
export async function generate(prompt, opts = {}) {
  const { model = 'mistral', system, temperature = 0.4 } = opts;
  const res = await fetch(`${HOST}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      system,
      stream: false,
      options: { temperature },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama generate ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.response.trim();
}
