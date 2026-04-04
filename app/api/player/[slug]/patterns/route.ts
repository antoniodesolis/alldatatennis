import { runMigrations } from "../../../../../lib/db/schema";
import { getPlayerPatterns } from "../../../../../lib/analytics/patterns";

runMigrations();

export async function GET(
  req: Request,
  ctx: RouteContext<"/api/player/[slug]/patterns">
) {
  const { slug } = await ctx.params;

  if (!/^[a-zA-Z0-9_-]{2,60}$/.test(slug)) {
    return Response.json({ error: "slug inválido" }, { status: 400 });
  }

  const url     = new URL(req.url);
  const surface = url.searchParams.get("surface") ?? "";
  const windowN = parseInt(url.searchParams.get("window") ?? "30");

  const [all, clay, hard, grass] = await Promise.all([
    getPlayerPatterns(slug, "", windowN),
    getPlayerPatterns(slug, "clay", windowN),
    getPlayerPatterns(slug, "hard", windowN),
    getPlayerPatterns(slug, "grass", windowN),
  ]);

  if (!all && !clay && !hard && !grass) {
    return Response.json({ slug, patterns: null, message: "Sin datos históricos aún" }, { status: 404 });
  }

  return Response.json(
    { slug, patterns: { all, clay, hard, grass } },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
