import { bad, json, route } from "@/lib/http";
import { finishImport, importBatch, startImport } from "@/lib/importer";
import { saveMapping } from "@/lib/services";

// One endpoint, three steps: start -> batch (repeat) -> finish. The browser parses the CSV and sends rows in batches.
export const POST = route(async ({ body, user }) => {
  switch (body.action) {
    case "start": {
      const started = await startImport(body, user);
      if (body.remember && body.signature) await saveMapping(String(body.signature), body.mapping);
      return json(started, 201);
    }
    case "batch":
      return json(await importBatch(body));
    case "finish":
      return json(await finishImport(body));
    default:
      throw bad("Unknown import step.");
  }
});
