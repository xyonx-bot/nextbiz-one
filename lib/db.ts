import { Pool } from "pg";

let pool: Pool | null = null;

/** Single pool; DATABASE_URL is the only DB env (Neon escape hatch). */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    });
  }
  return pool;
}
