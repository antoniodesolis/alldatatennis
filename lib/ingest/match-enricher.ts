/**
 * lib/ingest/match-enricher.ts
 *
 * Orquesta el enriquecimiento post-partido:
 *   1. Infiere el patrón del partido desde el marcador
 *   2. Busca crónica web (opcional, si hay fuente disponible)
 *   3. Llama a Claude para extraer insights (o usa inferencia desde marcador)
 *   4. Guarda en match_insights
 *   5. Acumula los insights en player_insights para ambos jugadores
 */

import { runMigrations } from "../db/schema";
import {
  getMatchesNeedingEnrichment,
  upsertMatchInsight,
  getPlayerInsights,
  savePlayerInsights,
  getPlayer,
  type AccumulatedInsights,
} from "../db/queries";
import { inferMatchPattern, type MatchPattern } from "../analytics/match-pattern";
import { fetchMatchChronicle } from "./chronicle-scraper";
import {
  extractInsightsFromChronicle,
  extractInsightsFromScore,
  type MatchInsights,
} from "./insight-extractor";
import { processPostMatchLearning } from "../analytics/post-match-learning";

// ── Acumulador de insights por jugador ────────────────────

function addToAccumulated(
  acc: AccumulatedInsights,
  insights: MatchInsights,
  pattern: MatchPattern,
  surface: string | null,
  isWinner: boolean,
): AccumulatedInsights {
  const next = { ...acc };

  // Patrón
  const p = pattern as keyof typeof acc.matchPatterns;
  if (p in next.matchPatterns) next.matchPatterns[p]++;
  next.matchCount++;
  next.lastUpdated = new Date().toISOString().slice(0, 10);

  // Observaciones tácticas (winner o loser)
  const tactical = isWinner ? insights.winnerTactical : insights.loserTactical;
  const newObs = [...(tactical.patterns ?? [])];
  if (isWinner && insights.winnerTactical.mentalNote) {
    next.mentalObservations = [
      insights.winnerTactical.mentalNote,
      ...next.mentalObservations,
    ].slice(0, 10);
  }

  // Armas y debilidades
  if (isWinner && insights.winnerTactical.weaponObserved) {
    next.weaponsConfirmed = dedup([
      insights.winnerTactical.weaponObserved,
      ...next.weaponsConfirmed,
    ]).slice(0, 8);
  }
  if (!isWinner && insights.loserTactical.weaknessObserved) {
    next.weaknessesConfirmed = dedup([
      insights.loserTactical.weaknessObserved,
      ...next.weaknessesConfirmed,
    ]).slice(0, 8);
  }

  // Acumular observaciones tácticas (mantener las 20 más recientes)
  next.tacticalObservations = [
    ...newObs,
    ...next.tacticalObservations,
  ].slice(0, 20);

  // Notas de superficie
  if (surface && insights.surfaceNote) {
    if (!next.surfaceNotes[surface]) next.surfaceNotes[surface] = [];
    next.surfaceNotes[surface] = [
      insights.surfaceNote,
      ...next.surfaceNotes[surface],
    ].slice(0, 5);
  }

  // Dinámica del partido también como observación
  if (insights.matchDynamics && insights.confidence !== "low") {
    next.tacticalObservations = [
      insights.matchDynamics,
      ...next.tacticalObservations,
    ].slice(0, 20);
  }

  return next;
}

function dedup(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.toLowerCase().trim()))]
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

// ── Enriquecimiento de un partido ─────────────────────────

interface EnrichResult {
  matchId:   string;
  pattern:   MatchPattern;
  hasChronicle: boolean;
  insightConfidence: string;
  error?:    string;
}

async function enrichMatch(row: {
  te_match_id: string;
  match_date: string;
  winner_slug: string;
  loser_slug: string | null;
  tournament: string | null;
  surface: string | null;
  score: string | null;
}): Promise<EnrichResult> {
  const matchId = row.te_match_id;
  const surface = row.surface ?? "hard";
  const tournament = row.tournament ?? "ATP";
  const score = row.score ?? "";

  // ── Paso 1: patrón desde marcador ─────────────────────
  const pattern = inferMatchPattern(score);

  // ── Paso 2: nombres legibles ───────────────────────────
  const [winnerPlayer, loserPlayer] = await Promise.all([
    getPlayer(row.winner_slug),
    row.loser_slug ? getPlayer(row.loser_slug) : Promise.resolve(undefined),
  ]);
  const winnerName = winnerPlayer?.full_name ?? row.winner_slug;
  const loserName  = loserPlayer?.full_name  ?? (row.loser_slug ?? "Oponente");

  let insights: MatchInsights | null = null;
  let chronicleUrl: string | null = null;
  let chronicleSrc: string | null = null;

  // ── Paso 3: buscar crónica (solo si no es walkover) ───
  if (pattern !== "walkover") {
    const chronicle = await fetchMatchChronicle({
      p1Name: winnerName,
      p2Name: loserName,
      p1ATPCode: winnerPlayer?.atp_code ?? undefined,
      p1Slug: row.winner_slug,
      tournament,
      matchDate: row.match_date,
    }).catch(() => null);

    if (chronicle) {
      chronicleUrl = chronicle.url;
      chronicleSrc = chronicle.source;
      insights = await extractInsightsFromChronicle(
        winnerName, loserName, tournament, surface, score, chronicle.text,
      ).catch(() => null);
    }
  }

  // ── Paso 4: si no hay crónica, inferir desde marcador ─
  if (!insights) {
    insights = await extractInsightsFromScore(
      winnerName, loserName, tournament, surface, score, pattern,
    ).catch(() => null);
  }

  // ── Paso 5: guardar en match_insights ─────────────────
  await upsertMatchInsight({
    te_match_id:   matchId,
    match_date:    row.match_date,
    winner_slug:   row.winner_slug,
    loser_slug:    row.loser_slug ?? "",
    tournament,
    surface,
    score,
    match_pattern: pattern,
    chronicle_url: chronicleUrl,
    chronicle_src: chronicleSrc,
    insights_json: insights ? JSON.stringify(insights) : null,
    enriched_at:   Math.floor(Date.now() / 1000),
  });

  // ── Paso 6: acumular en player_insights ───────────────
  if (insights) {
    // Ganador
    const winnerAcc = await getPlayerInsights(row.winner_slug);
    await savePlayerInsights(row.winner_slug, addToAccumulated(winnerAcc, insights, pattern, surface, true));

    // Perdedor
    if (row.loser_slug) {
      const loserAcc = await getPlayerInsights(row.loser_slug);
      await savePlayerInsights(row.loser_slug, addToAccumulated(loserAcc, insights, pattern, surface, false));
    }
  }

  // ── Paso 7: aprendizaje post-partido ──────────────────
  if (row.loser_slug) {
    try {
      await processPostMatchLearning(
        matchId, row.match_date,
        row.winner_slug, row.loser_slug,
        pattern,
      );
    } catch { /* no bloquear el flujo si falla el aprendizaje */ }
  }

  return {
    matchId,
    pattern,
    hasChronicle: !!chronicleUrl,
    insightConfidence: insights?.confidence ?? "none",
  };
}

// ── API pública ───────────────────────────────────────────

export interface EnrichmentSummary {
  processed:  number;
  patterns:   Record<string, number>;
  chronicles: number;
  claudeCalls: number;
  errors:     number;
  details:    EnrichResult[];
}

/**
 * Enriquece los partidos terminados de los últimos N días que aún no tienen insights.
 * @param since  YYYY-MM-DD — solo procesar partidos desde esta fecha
 * @param limit  máximo de partidos a procesar por llamada
 */
export async function enrichRecentMatches(
  since: string,
  limit = 30,
): Promise<EnrichmentSummary> {
  await runMigrations();

  const pending = await getMatchesNeedingEnrichment(since, limit);

  const summary: EnrichmentSummary = {
    processed: 0,
    patterns: {},
    chronicles: 0,
    claudeCalls: 0,
    errors: 0,
    details: [],
  };

  for (const row of pending) {
    try {
      const result = await enrichMatch(row);
      summary.processed++;
      summary.patterns[result.pattern] = (summary.patterns[result.pattern] ?? 0) + 1;
      if (result.hasChronicle) summary.chronicles++;
      if (result.insightConfidence === "high" || result.insightConfidence === "medium") summary.claudeCalls++;
      summary.details.push(result);
    } catch (err) {
      summary.errors++;
      summary.details.push({
        matchId: row.te_match_id,
        pattern: "irregular",
        hasChronicle: false,
        insightConfidence: "none",
        error: (err as Error).message,
      });
    }

    // Pequeña pausa para no saturar APIs externas
    await new Promise((r) => setTimeout(r, 300));
  }

  return summary;
}
