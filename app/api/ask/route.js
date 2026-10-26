import { bad, json, route } from "@/lib/http";
import { answer } from "@/lib/ask";

// Read-only answers. The one write (a note) goes through the normal notes endpoint after the person presses Save.
export const POST = route(async ({ body }) => {
  const q = String(body.q ?? "").slice(0, 300);
  if (!q.trim()) throw bad("Type a question.");
  return json(await answer(q));
});
