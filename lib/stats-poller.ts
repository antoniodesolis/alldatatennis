/**
 * Poller de estadísticas — se arranca desde instrumentation.ts SOLO en entorno local.
 *
 * En Vercel (serverless) este módulo no hace nada:
 *   - setInterval no persiste entre invocaciones de función
 *   - No existe localhost:3000 en el contexto de ejecución
 *   - El daily-sync lo gestiona el cron job de Vercel
 *
 * En local corre cada 20 minutos para procesar partidos terminados del día.
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

    // isMatchProcessed es async — filtrar con Promise.all
    const processedFlags = await Promise.all(
      finished.map((m: { id: string }) => isMatchProcessed(`te_${m.id}`))
    );
    const unprocessed = finished.filter((_: unknown, i: number) => !processedFlags[i]);

    if (unprocessed.length === 0) {
      console.log(`[poller] ${finished.length} terminados, todos ya procesados.`);
      return;
    }

    const { scraped, errors } = await scrapeFinishedMatches(matches);

    // Invalidar caché de patrones de jugadores afectados (resetPatterns es async)
    const slugsAffected = new Set<string>();
    for (const m of unprocessed) {
      if (m.player1Slug) slugsAffected.add(m.player1Slug);
      if (m.player2Slug) slugsAffected.add(m.player2Slug);
    }
    await Promise.all([...slugsAffected].map((slug) => resetPatterns(slug)));

    console.log(`[poller] Scraped: ${scraped}, errores: ${errors}, patrones invalidados: ${slugsAffected.size}`);
  } catch (err) {
    console.error("[poller] Error en ciclo:", (err as Error).message);
  }
}

export function startStatsPoller() {
  // No arrancar en Vercel / entornos serverless
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    console.log("[poller] Entorno Vercel detectado — poller desactivado (usa cron job).");
    return;
  }

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
