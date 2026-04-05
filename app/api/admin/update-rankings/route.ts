/**
 * POST /api/admin/update-rankings
 *
 * Fuerza una actualización del ranking ATP top 100 desde atptour.com
 * y persiste el resultado en la base de datos.
 */

import { NextRequest, NextResponse } from "next/server";
import { scrapeRankings, saveRankingsToDB, loadRankingsFromDB } from "../../rankings/route";
import type { ATPPlayer } from "../../rankings/route";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { players?: ATPPlayer[] };

    if (body.players && Array.isArray(body.players) && body.players.length >= 20) {
      const players = body.players as ATPPlayer[];
      const normalized = players.map((p) => ({
        ...p,
        photo: p.photo || `https://www.atptour.com/-/media/alias/player-headshot/${p.atpCode}`,
        points: p.points ?? "",
      }));
      await saveRankingsToDB(normalized);
      return NextResponse.json({
        ok: true,
        source: "manual",
        count: normalized.length,
        message: `${normalized.length} rankings actualizados manualmente`,
        top5: normalized.slice(0, 5).map((p) => `${p.rank}. ${p.name}`),
      });
    }

    const players = await scrapeRankings();
    if (!players || players.length < 20) {
      return NextResponse.json({ ok: false, error: "Scraping devolvió menos de 20 jugadores" }, { status: 502 });
    }

    await saveRankingsToDB(players);

    return NextResponse.json({
      ok: true,
      source: "live",
      count: players.length,
      message: `Top ${players.length} actualizado desde atptour.com`,
      top5: players.slice(0, 5).map((p) => `${p.rank}. ${p.name}`),
      updatedAt: new Date().toISOString(),
    });

  } catch (err) {
    const msg = (err as Error).message;
    console.error("[update-rankings] ERROR:", msg);

    const current = await loadRankingsFromDB();
    return NextResponse.json({
      ok: false,
      error: msg,
      dbStatus: current
        ? `DB tiene ${current.players.length} rankings (actualizados ${new Date(current.updatedAt * 1000).toLocaleDateString("es-ES")})`
        : "Sin rankings en DB",
    }, { status: 502 });
  }
}

export async function GET() {
  const current = await loadRankingsFromDB();
  if (!current) {
    return NextResponse.json({ status: "Sin rankings en DB — usando datos estáticos", updatedAt: null });
  }
  const daysAgo = Math.floor((Date.now() / 1000 - current.updatedAt) / 86400);
  return NextResponse.json({
    status: "ok",
    count: current.players.length,
    updatedAt: new Date(current.updatedAt * 1000).toISOString(),
    daysAgo,
    top10: current.players.slice(0, 10).map((p) => `${p.rank}. ${p.name}`),
  });
}
