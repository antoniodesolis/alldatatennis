import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "tennis.db");

// Ensure data/ directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Singleton via globalThis to survive Next.js hot-reload
declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (!globalThis.__db) {
    globalThis.__db = new Database(DB_PATH);
    globalThis.__db.pragma("journal_mode = WAL");
    globalThis.__db.pragma("foreign_keys = ON");
    globalThis.__db.pragma("synchronous = NORMAL");
  }
  return globalThis.__db;
}
