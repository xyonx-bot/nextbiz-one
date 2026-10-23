import { randomBytes, timingSafeEqual } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { getPool } from "./db";

const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  isOperator: boolean;
};

function eq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** v1 default workspace (single-workspace product; P2 goes multi). */
export async function ensureDefaultWorkspace(): Promise<string> {
  const p = getPool();
  const { rows } = await p.query(
    `INSERT INTO workspaces (name) VALUES ('NextBiz One')
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  );
  return rows[0].id as string;
}

/**
 * Login. S0 operator bootstrap: no signup exists yet, so the FIRST
 * login that matches OPERATOR_EMAIL/OPERATOR_PASS env creates the
 * operator user (approved, operator flag) — plan §2 "operator bootstrap".
 * Existing users go through bcrypt compare. Never reveals which
 * part failed.
 */
export async function login(email: string, password: string): Promise<SessionUser | null> {
  const p = getPool();
  const norm = email.trim().toLowerCase();
  const { rows } = await p.query(
    `SELECT u.id, u.email, u.password_hash, u.display_name, u.is_operator, u.is_approved,
            COALESCE(w.revoked, false) AS ws_revoked
       FROM users u LEFT JOIN workspaces w ON w.id = u.workspace_id
      WHERE u.email = $1`,
    [norm],
  );

  if (rows.length === 0) {
    const opEmail = (process.env.OPERATOR_EMAIL ?? "").trim().toLowerCase();
    const opPass = process.env.OPERATOR_PASS ?? "";
    if (!opEmail || !opPass || !eq(norm, opEmail) || !eq(password, opPass)) return null;
    const ws = await ensureDefaultWorkspace();
    const display = norm.split("@")[0];
    const ins = await p.query(
      `INSERT INTO users (workspace_id, email, password_hash, display_name, is_operator, is_approved)
       VALUES ($1, $2, $3, $4, true, true)
       ON CONFLICT (email) DO UPDATE SET is_operator = true, is_approved = true
       RETURNING id, email, display_name, is_operator`,
      [ws, norm, await hash(opPass, 10), display],
    );
    const u = ins.rows[0];
    return { id: u.id, email: u.email, displayName: u.display_name, isOperator: true };
  }

  const u = rows[0];
  // operator: env creds remain the source of truth — a matching env login
  // re-hashes the stored row, so rotating OPERATOR_PASS in .env + restart
  // just works (S0 bootstrap; S3 brings real account management)
  const opEmail2 = (process.env.OPERATOR_EMAIL ?? "").trim().toLowerCase();
  const opPass2 = process.env.OPERATOR_PASS ?? "";
  if (u.is_operator && opEmail2 === norm && opPass2 && eq(password, opPass2)) {
    await getPool().query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
      await hash(opPass2, 10),
      u.id,
    ]);
  }
  const ok = await compare(password, u.password_hash);
  if (!ok) return null;
  if (!u.is_approved) return null; // access gate: unapproved users cannot pass (S3 handles approvals)
  if (u.ws_revoked) return null;   // revoked workspace = login blocked (S3 P1.3)
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name || u.email.split("@")[0],
    isOperator: u.is_operator,
  };
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await getPool().query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt],
  );
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const { rows } = await getPool().query(
    `SELECT u.id, u.email, u.display_name, u.is_operator, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  if (rows.length === 0) return null;
  const u = rows[0];
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name || u.email.split("@")[0],
    isOperator: u.is_operator,
  };
}

export async function destroySession(token: string): Promise<void> {
  await getPool().query(`DELETE FROM sessions WHERE token = $1`, [token]);
}
