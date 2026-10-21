import { route } from "@/lib/http";
import { exportAll } from "@/lib/services";

export const GET = route(async () => {
  const data = await exportAll();
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="snackible-crm-backup-${data.exportedAt.slice(0, 10)}.json"`,
    },
  });
}, { admin: true });
