/**
 * scripts/migrate-data.mjs
 *
 * Migra todos los datos de data/tennis.db (SQLite local) a Turso (remote).
 * Lee credenciales de .env.local.
 *
 * Uso: node scripts/migrate-data.mjs
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Leer .env.local ───────────────────────────────────────
function loadEnv() {
  const envPath = join(ROOT, ".env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const TURSO_URL   = env.TURSO_DATABASE_URL;
const TURSO_TOKEN = env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("❌ Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN en .env.local");
  process.exit(1);
}

// ── Clientes ──────────────────────────────────────────────
const local = createClient({ url: `file:${join(ROOT, "data", "tennis.db")}` });
const remote = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

// ── Tablas a migrar (en orden por dependencias) ───────────
const TABLES = [
  "players",
  "atp_rankings",
  "player_match_stats",
  "processed_matches",
  "prediction_log",
  "factor_calibration",
  "match_insights",
  "player_insights",
  "tournament_models",
  "player_patterns",
];

const BATCH_SIZE = 50; // filas por batch (Turso tiene límite de statements por batch)

async function getColumns(client, table) {
  const res = await client.execute(`PRAGMA table_info(${table})`);
  return res.rows.map((r) => r.name);
}

async function countRows(client, table) {
  const res = await client.execute(`SELECT COUNT(*) as n FROM ${table}`);
  return Number(res.rows[0].n);
}

async function migrateTable(table) {
  // Comprobar que la tabla existe en local
  const existsRes = await local.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [table]
  ).catch(() => ({ rows: [] }));
  if (!existsRes.rows.length) {
    console.log(`  ⚠️  ${table}: no existe en local, saltando`);
    return { skipped: true };
  }

  const total = await countRows(local, table);
  if (total === 0) {
    console.log(`  ○  ${table}: vacía, saltando`);
    return { inserted: 0, total: 0 };
  }

  const cols = await getColumns(local, table);
  const colList = cols.join(", ");
  const placeholders = cols.map(() => "?").join(", ");
  const insertSql = `INSERT OR IGNORE INTO ${table} (${colList}) VALUES (${placeholders})`;

  let offset = 0;
  let inserted = 0;
  let errors = 0;

  while (offset < total) {
    const rowsRes = await local.execute(
      `SELECT ${colList} FROM ${table} LIMIT ${BATCH_SIZE} OFFSET ${offset}`
    );
    const rows = rowsRes.rows;
    if (!rows.length) break;

    // Construir batch de statements
    const statements = rows.map((row) => ({
      sql: insertSql,
      args: cols.map((c) => {
        const v = row[c];
        // Convertir BigInt a Number para compatibilidad
        return typeof v === "bigint" ? Number(v) : (v ?? null);
      }),
    }));

    try {
      await remote.batch(statements, "write");
      inserted += rows.length;
    } catch (err) {
      // Si el batch falla, intentar fila a fila
      for (const stmt of statements) {
        try {
          await remote.execute(stmt);
          inserted++;
        } catch {
          errors++;
        }
      }
    }

    offset += rows.length;
    process.stdout.write(
      `\r  ↑  ${table}: ${offset}/${total} filas (${errors > 0 ? `⚠️ ${errors} errores` : "ok"})`
    );
  }
  process.stdout.write("\n");
  return { inserted, total, errors };
}

async function ensureSchema() {
  // Crear todas las tablas en Turso antes de insertar datos
  console.log("📐 Creando esquema en Turso...");
  const schemaRes = await local.execute(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid`
  );
  for (const row of schemaRes.rows) {
    if (!row.sql) continue;
    try {
      await remote.execute(row.sql + "");
    } catch (err) {
      // Ignorar si la tabla ya existe
      if (!err.message?.includes("already exists")) {
        console.warn(`  ⚠️  Schema error: ${err.message}`);
      }
    }
  }

  // Crear índices
  const idxRes = await local.execute(
    `SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL`
  );
  for (const row of idxRes.rows) {
    if (!row.sql) continue;
    try {
      await remote.execute(row.sql + "");
    } catch {
      // Ignorar índices ya existentes
    }
  }
  console.log("  ✓ Esquema listo\n");
}

async function main() {
  console.log("🚀 Migración local → Turso");
  console.log(`   Origen : data/tennis.db`);
  console.log(`   Destino: ${TURSO_URL}\n`);

  // Test de conexión remota
  try {
    await remote.execute("SELECT 1");
    console.log("✓ Conexión a Turso OK\n");
  } catch (err) {
    console.error(`❌ No se puede conectar a Turso: ${err.message}`);
    process.exit(1);
  }

  await ensureSchema();

  const results = {};
  for (const table of TABLES) {
    process.stdout.write(`  → ${table}... `);
    try {
      results[table] = await migrateTable(table);
    } catch (err) {
      console.log(`\n  ❌ Error en ${table}: ${err.message}`);
      results[table] = { error: err.message };
    }
  }

  console.log("\n── Resumen ──────────────────────────────────");
  let totalRows = 0;
  for (const [table, r] of Object.entries(results)) {
    if (r.skipped) console.log(`  ${table}: saltada`);
    else if (r.error) console.log(`  ${table}: ERROR — ${r.error}`);
    else {
      const errNote = r.errors > 0 ? ` (${r.errors} errores)` : "";
      console.log(`  ${table}: ${r.inserted}/${r.total} filas${errNote}`);
      totalRows += r.inserted ?? 0;
    }
  }
  console.log(`\n✅ Total migrado: ${totalRows.toLocaleString()} filas`);
  console.log("   Turso listo para Vercel.\n");
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
