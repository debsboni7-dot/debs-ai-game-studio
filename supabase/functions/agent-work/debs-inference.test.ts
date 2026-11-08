import { buildAgentCompletionPayload, extractAgentCompletionText } from "./debs-inference.ts";

Deno.test("agent requests use the self-hosted chat-completions contract", () => {
  const payload = buildAgentCompletionPayload("qwen2.5:3b", "Analyse ce projet.");
  if (payload.model !== "qwen2.5:3b") throw new Error("model mismatch");
  if (payload.stream !== false || payload.temperature !== 0) throw new Error("generation settings mismatch");
  if (payload.messages.length !== 2 || payload.messages[1].content !== "Analyse ce projet.") {
    throw new Error("messages mismatch");
  }
});

Deno.test("agent prompt length is bounded to the gateway contract", () => {
  let rejected = false;
  try { buildAgentCompletionPayload("qwen2.5:3b", "x".repeat(19_001)); } catch { rejected = true; }
  if (!rejected) throw new Error("oversized prompt was accepted");
});

Deno.test("extracts OpenAI-compatible assistant text", () => {
  const text = extractAgentCompletionText({ choices: [{ message: { content: "  {\"done\":true}  " } }] });
  if (text !== "{\"done\":true}") throw new Error("assistant content was not normalized");
});

Deno.test("rejects empty or malformed model responses", () => {
  for (const payload of [{}, { choices: [] }, { choices: [{ message: { content: " " } }] }]) {
    let rejected = false;
    try { extractAgentCompletionText(payload); } catch { rejected = true; }
    if (!rejected) throw new Error("malformed model response was accepted");
  }
});
