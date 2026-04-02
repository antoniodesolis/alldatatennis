/**
 * Poller de estadísticas — se arranca desde instrumentation.ts.
 * Cada 20 minutos:
 *   1. Obtiene los partidos del día (reutiliza la lógica de /api/matches)
 *   2. Para cada partido terminado que no esté procesado: scraping TennisExplorer
 *   3. Invalida caché de patrones de los jugadores afectados
 */

import { scrapeFinishedMatches } from "./ingest/te-scraper";
import { resetPatterns } from "./analytics/patterns";
import { isMatchProcessed } from "./db/queries";

const POLL_INTERVAL_MS = 20 * 60 * 1000; // 20 minutos

let pollTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchTodaysMatches() {
  try {
    const res = await fetch("http://localhost:3000/api/matches", {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.matches ?? [];
  } catch {
    return [];
  }
}

async function runPoll() {
  console.log("[poller] Ejecutando ciclo de sync de stats…");
  try {
    const matches = await fetchTodaysMatches();
    if (matches.length === 0) {
      console.log("[poller] Sin partidos hoy.");
      return;
    }

    const finished = matches.filter((m: { status: string }) => m.status === "finished");
    const unprocessed = finished.filter((m: { id: string }) => !isMatchProcessed(`te_${m.id}`));

    if (unprocessed.length === 0) {
      console.log(`[poller] ${finished.length} terminados, todos ya procesados.`);
      return;
    }

    const { scraped, errors } = await scrapeFinishedMatches(matches);

    // Invalidar caché de patrones de jugadores afectados
    const slugsAffected = new Set<string>();
    for (const m of unprocessed) {
      if (m.player1Slug) slugsAffected.add(m.player1Slug);
      if (m.player2Slug) slugsAffected.add(m.player2Slug);
    }
    for (const slug of slugsAffected) resetPatterns(slug);

    console.log(`[poller] Scraped: ${scraped}, errores: ${errors}, patrones invalidados: ${slugsAffected.size}`);
  } catch (err) {
    console.error("[poller] Error en ciclo:", (err as Error).message);
  }
}

export function startStatsPoller() {
  // Primera ejecución al arrancar (con delay de 30s para que el servidor esté listo)
  setTimeout(() => {
    runPoll();
    pollTimer = setInterval(runPoll, POLL_INTERVAL_MS);
  }, 30_000);

  console.log("[poller] Stats poller iniciado. Intervalo: 20 min.");
}

export function stopStatsPoller() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
