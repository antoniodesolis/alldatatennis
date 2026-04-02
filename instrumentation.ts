/**
 * Next.js instrumentation — se ejecuta una sola vez al arrancar el servidor.
 * Inicializa la base de datos SQLite y arranca el poller de estadísticas.
 */

export async function register() {
  // Solo en runtime Node.js (no Edge runtime)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runMigrations } = await import("./lib/db/schema");
  runMigrations();
  console.log("[instrumentation] Migraciones SQLite aplicadas.");

  const { startStatsPoller } = await import("./lib/stats-poller");
  startStatsPoller();
}
