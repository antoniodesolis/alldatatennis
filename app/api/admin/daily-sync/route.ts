/**
 * POST /api/admin/daily-sync
 *
 * Pipeline diario completo de retroalimentación. Ejecutar una vez al día
 * (ej. 06:00 AM, cuando los partidos del día anterior ya están terminados).
 *
 * Pasos:
 *   1. Ingestar partidos de ayer (te-history scraper)
 *   2. Enriquecer opponent_rank de las nuevas filas
 *   3. Backfill opponent_style desde patrones y mapa estático
 *   4. Resolver predicciones pendientes (comparar con resultado real)
 *   5. Recalibrar pesos de factores basándose en el historial de errores
 *   6. Invalidar player_patterns de los jugadores afectados (recomputan al siguiente request)
 *
 * GET devuelve el estado del sistema de aprendizaje (stats sin ejecutar el sync).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { scrapeTeMonth } from "@/lib/ingest/te-history";
import { ATP_SLUG_MAP } from "@/lib/analytics/player-resolver";
import { resolveFinishedMatches, recomputeCalibration, getLearningStats } from "@/lib/learning/feedback";
import { backfillOpponentStyles, reclassifyAllStyles } from "@/lib/learning/style-classifier";
import { getPlayerPatterns, resetPatterns } from "@/lib/analytics/patterns";

// ── ATP_RANK (top-100 atpCode → rank, same as enrich-ranks) ─
const ATP_RANK: Record<string, number> = {
  "a0e2":1,  "s0ag":2,  "z355":3,  "d643":4,  "m0ej":5,  "dh58":6,  "ag37":7,
  "fb98":8,  "s0s1":9,  "mm58":10, "bk92":11, "rh16":12, "c0e9":13, "l0bv":14,
  "ke29":15, "re44":16, "dh50":17, "td51":18, "d0fj":19, "c0au":20, "pl56":21,
  "t0ha":22, "va25":23, "n771":24, "d0co":25, "m0ni":26, "rc91":27, "f0f1":28,
  "r0dg":29, "gj37":30, "ea24":31, "mw02":32, "n0ae":33, "hh26":34, "m0qi":35,
  "d0f6":36, "mu94":37, "su55":38, "te30":39, "f0fv":40, "b0cd":41, "k0ah":42,
  "me82":43, "a0gc":44, "p09z":45, "bu13":46, "m0ci":47, "bt72":48, "te51":49,
  "b0bi":50, "f724":51, "ae14":52, "mq75":53, "c977":54, "m0fh":55, "q02l":56,
  "m0gz":57, "ki95":58, "b0id":59, "n0bs":60, "h997":61, "v812":62, "su87":63,
  "o522":64, "c0jp":65, "gc88":66, "u182":67, "c0h0":68, "c0c8":69, "ki82":70,
  "r0eb":71, "hb71":72, "b0gg":73, "d923":74, "sl28":75, "s0h2":76, "b0fv":77,
  "o513":78, "s0ja":79, "bd06":80, "m0jf":81, "s0k7":82, "t0a1":83, "v832":84,
  "k0az":85, "m0jz":86, "c0df":87, "cd85":88, "j0dz":89, "hb64":90, "bk40":91,
  "b0pg":92, "d875":93, "mp20":94, "d994":95, "k0a3":96, "f0by":97, "w367":98,
  "d0c1":99, "gd64":100,
};

function buildSlugRankMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const [slug, code] of Object.entries(ATP_SLUG_MAP)) {
    const rank = ATP_RANK[code];
    if (rank !== undefined && !map.has(slug)) map.set(slug, rank);
  }
  return map;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/** Enriches opponent_rank for all NULL rows via the 6-pass algorithm */
function enrichNewRanks(): number {
  const db = getDb();
  const slugRankMap = buildSlugRankMap();
  const atpSlugSet = new Set(Object.keys(ATP_SLUG_MAP));

  const updateStmt = db.prepare(
    "UPDATE player_match_stats SET opponent_rank = ? WHERE source='te_history' AND opponent_slug = ? AND opponent_rank IS NULL"
  );
  const peerRankStmt = db.prepare(
    "SELECT opponent_rank FROM player_match_stats WHERE te_slug = ? AND opponent_rank IS NOT NULL ORDER BY match_date DESC LIMIT 30"
  );
  const sackStmt = db.prepare(
    "SELECT opponent_rank FROM player_match_stats WHERE source='sackmann_csv' AND opponent_slug = ? AND opponent_rank IS NOT NULL ORDER BY match_date DESC LIMIT 1"
  );

  const getStillNull = () =>
    (db.prepare(
      "SELECT DISTINCT opponent_slug FROM player_match_stats WHERE source='te_history' AND opponent_rank IS NULL AND opponent_slug IS NOT NULL"
    ).all() as { opponent_slug: string }[]).map((r) => r.opponent_slug);

  let total = 0;

  const run = db.transaction(() => {
    // Pass 1: top-100
    for (const slug of getStillNull()) {
      const rank = slugRankMap.get(slug);
      if (rank) total += updateStmt.run(rank, slug).changes;
    }
    // Pass 2: sackmann
    for (const slug of getStillNull()) {
      const row = sackStmt.get(slug) as { opponent_rank: number } | undefined;
      if (row) total += updateStmt.run(row.opponent_rank, slug).changes;
    }
    // Pass 3: peer inference ≥3
    for (const slug of getStillNull()) {
      const rows = peerRankStmt.all(slug) as { opponent_rank: number }[];
      if (rows.length >= 3) {
        const sorted = rows.map((r) => r.opponent_rank).sort((a, b) => a - b);
        total += updateStmt.run(median(sorted), slug).changes;
      }
    }
    // Pass 4: ATP map default 150
    for (const slug of getStillNull()) {
      if (atpSlugSet.has(slug)) total += updateStmt.run(150, slug).changes;
    }
    // Pass 5: peer inference ≥1
    for (const slug of getStillNull()) {
      const rows = peerRankStmt.all(slug) as { opponent_rank: number }[];
      if (rows.length >= 1) {
        const sorted = rows.map((r) => r.opponent_rank).sort((a, b) => a - b);
        total += updateStmt.run(median(sorted), slug).changes;
      }
    }
    // Pass 6: universal default 250
    total += db.prepare(
      "UPDATE player_match_stats SET opponent_rank = 250 WHERE source='te_history' AND opponent_rank IS NULL AND opponent_slug IS NOT NULL"
    ).run().changes;
  });

  run();
  return total;
}

/** Merge alias slugs that may have been introduced by new TE data */
function normalizeNewSlugs(): number {
  const db = getDb();
  const SLUG_MERGES: Record<string, string> = {
    "de-minaur":         "minaur",
    "davidovich-fokina": "fokina",
    "carabelli":         "ugo-carabelli",
  };
  let updated = 0;
  const run = db.transaction(() => {
    for (const [alias, canonical] of Object.entries(SLUG_MERGES)) {
      updated += db.prepare("UPDATE player_match_stats SET te_slug = ? WHERE te_slug = ?").run(canonical, alias).changes;
      updated += db.prepare("UPDATE player_match_stats SET opponent_slug = ? WHERE opponent_slug = ?").run(canonical, alias).changes;
    }
  });
  run();
  return updated;
}

/**
 * Extract finished matches from newly ingested data to resolve predictions.
 * Returns array of {matchId, winnerSlug} for all te_history entries from yesterday.
 */
function getYesterdayFinishedMatches(date: string): Array<{ matchId: string; winnerSlug: string }> {
  const db = getDb();
  // Each te_match_id is "{date}_{tournamentSlug}_{matchIndex}" for te_history rows
  // We need: for each match pair, the winner = the te_slug where result='W'
  const rows = db.prepare(`
    SELECT te_match_id, te_slug, result
    FROM player_match_stats
    WHERE source = 'te_history' AND match_date = ? AND result = 'W'
  `).all(date) as { te_match_id: string; te_slug: string; result: string }[];

  return rows.map((r) => ({
    matchId: r.te_match_id,
    winnerSlug: r.te_slug,
  }));
}

/** Returns slugs of players who have new data on the given date */
function getAffectedSlugs(date: string): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT te_slug FROM player_match_stats
    WHERE match_date = ? AND source = 'te_history'
  `).all(date) as { te_slug: string }[];
  return rows.map((r) => r.te_slug);
}

/**
 * Recompute patterns for a list of slugs immediately (eager, not lazy).
 * Each call to getPlayerPatterns with a stale/missing cache forces a fresh computation.
 */
async function recomputePatternsForSlugs(slugs: string[]): Promise<{ recomputed: number; errors: number }> {
  let recomputed = 0;
  let errors = 0;
  for (const slug of slugs) {
    try {
      // Force fresh computation: delete existing cache first
      resetPatterns(slug);
      // Recompute for all surfaces (global '' + surface-specific splits used in predictions)
      await getPlayerPatterns(slug, "", 50);
      await getPlayerPatterns(slug, "", 30);
      recomputed++;
    } catch {
      errors++;
    }
  }
  return { recomputed, errors };
}

// ── GET: estado del sistema de aprendizaje ────────────────

export async function GET() {
  const stats = getLearningStats();
  return NextResponse.json({ ok: true, learningStats: stats });
}

// ── POST: ejecutar pipeline diario ────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { date?: string; dryRun?: boolean };

  // Fecha a ingestar (por defecto ayer)
  const targetDate = body.date ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const [year, month] = targetDate.split("-").map(Number);
  const dryRun = body.dryRun ?? false;

  const result: Record<string, unknown> = { date: targetDate, dryRun };

  if (dryRun) {
    const stats = getLearningStats();
    return NextResponse.json({ ok: true, dryRun: true, learningStats: stats });
  }

  // ── Paso 1: Ingestar partidos del día ────────────────────
  console.log(`[daily-sync] Ingesting ${targetDate}…`);
  try {
    const ingestResult = await scrapeTeMonth(year, month);
    result.ingest = {
      matches: ingestResult.matches,
      inserted: ingestResult.inserted,
      dupes: ingestResult.dupes,
    };
  } catch (err) {
    result.ingest = { error: (err as Error).message };
  }

  // ── Paso 2: Normalizar slugs (alias → canonical) ─────────
  const normalizeUpdated = normalizeNewSlugs();
  result.normalize = { rowsUpdated: normalizeUpdated };

  // ── Paso 3: Enriquecer opponent_rank ────────────────────
  const rankRows = enrichNewRanks();
  result.enrichRanks = { rowsUpdated: rankRows };

  // ── Paso 4: Backfill + reclasificación de estilos ────────
  // Actualiza opponent_style en filas sin dato + reclasifica todos los jugadores
  // con patrones ya computados para que el registro histórico sea más preciso
  const styleRows = backfillOpponentStyles();
  const styleClassified = reclassifyAllStyles();
  result.backfillStyles = { rowsUpdated: styleRows, reclassified: styleClassified.length };

  // ── Paso 5: Resolver predicciones del día ────────────────
  const finishedMatches = getYesterdayFinishedMatches(targetDate);
  const resolvedPreds = resolveFinishedMatches(finishedMatches);
  result.resolvedPredictions = { count: resolvedPreds, finishedMatchesFound: finishedMatches.length };

  // ── Paso 6: Recalibrar factores ──────────────────────────
  const calibration = recomputeCalibration();
  result.calibration = Object.fromEntries(
    Object.entries(calibration).map(([id, c]) => [id, {
      samples: c.sample_count,
      accuracy: Math.round(c.avg_accuracy * 100) + "%",
      weightMult: c.weight_mult.toFixed(3),
    }])
  );

  // ── Paso 7: Recomputar análisis de jugadores afectados ───
  // No solo invalida — fuerza recalculo inmediato de patrones con los datos nuevos
  // para que las fichas y predicciones reflejen el partido recién añadido
  const affectedSlugs = getAffectedSlugs(targetDate);
  const patternResult = await recomputePatternsForSlugs(affectedSlugs);
  result.patternsRecomputed = {
    players: affectedSlugs.length,
    recomputed: patternResult.recomputed,
    errors: patternResult.errors,
    slugs: affectedSlugs,
  };

  // ── Resumen ───────────────────────────────────────────────
  const stats = getLearningStats();
  result.learningStats = {
    totalPredictions: stats.totalPredictions,
    resolved: stats.resolved,
    pending: stats.pending,
    accuracy: stats.accuracy != null ? Math.round(stats.accuracy * 100) + "%" : null,
  };

  console.log("[daily-sync] Done:", JSON.stringify(result, null, 2));
  return NextResponse.json({ ok: true, ...result });
}
