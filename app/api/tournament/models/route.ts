import { runMigrations } from "../../../../lib/db/schema";
import { getAllCourtModels } from "../../../../lib/analytics/court-speed";

runMigrations();

export async function GET() {
  const models = getAllCourtModels();
  return Response.json(
    { models },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
