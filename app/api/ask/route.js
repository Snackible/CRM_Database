import { bad, json, route } from "@/lib/http";
import { chat, cleanContext } from "@/lib/chat";

export const maxDuration = 60; // room for Gemini to be retried when it is busy

// Read-only answers, free and unlimited: rules over the CRM's own data, no model, nothing leaves the server.
// The one write (a note) goes through the normal notes endpoint after the person presses Save.
// body: { q, ctx? } where ctx is the context the previous answer returned (the client being talked about, the last question).
export const POST = route(async ({ body }) => {
  const q = String(body.q ?? "").slice(0, 300);
  if (!q.trim()) throw bad("Type a question.");
  return json(await chat(q, cleanContext(body.ctx)));
});
