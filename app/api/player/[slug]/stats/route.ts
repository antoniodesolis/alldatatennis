import { runMigrations } from "../../../../../lib/db/schema";
import { getPlayerMatches, countPlayerMatches, getPlayer } from "../../../../../lib/db/queries";
import { canonicalSlug } from "../../../../../lib/analytics/player-resolver";

runMigrations();

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/player/[slug]/stats">
) {
  const rawSlug = (await ctx.params).slug;

  if (!/^[a-zA-Z0-9_-]{2,60}$/.test(rawSlug)) {
    return Response.json({ error: "slug inválido" }, { status: 400 });
  }

  const slug = canonicalSlug(rawSlug);
  const url = new URL(_req.url);
  const surface = url.searchParams.get("surface") ?? undefined;
  const limit   = parseInt(url.searchParams.get("limit") ?? "50");
  const season  = url.searchParams.get("season") ? parseInt(url.searchParams.get("season")!) : undefined;

  const player  = getPlayer(slug);
  const matches = getPlayerMatches(slug, { surface, limit, season });
  const total   = countPlayerMatches(slug);

  return Response.json({ slug, player, total, matches }, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
