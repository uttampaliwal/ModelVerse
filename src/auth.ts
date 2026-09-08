import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { log } from './logger';

export interface UserRecord {
  username: string;
  passwordHash: string;
  salt: string;
  admin: boolean;
  createdAt: string;
}

export interface SessionClaims {
  sub: string;
  admin: boolean;
  iat: number;
  exp: number;
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SECRET_BYTES = 32;

function storeFile(): string {
  return process.env.AUTH_STORE_FILE || path.join(process.cwd(), 'users.json');
}

function secretFile(): string {
  return process.env.AUTH_SECRET_FILE || path.join(process.cwd(), '.auth-secret');
}

function loadUsers(): UserRecord[] {
  try {
    if (!fs.existsSync(storeFile())) return [];
    const raw: unknown = JSON.parse(fs.readFileSync(storeFile(), 'utf-8'));
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (u): u is UserRecord =>
        !!u &&
        typeof (u as UserRecord).username === 'string' &&
        typeof (u as UserRecord).passwordHash === 'string' &&
        typeof (u as UserRecord).salt === 'string',
    );
  } catch {
    return [];
  }
}

function saveUsers(users: UserRecord[]): void {
  mkdirRecursive(storeFile());
  fs.writeFileSync(storeFile(), JSON.stringify(users, null, 2), { mode: 0o600 });
}

function mkdirRecursive(file: string): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  } catch {
    /* ignore: directory may already exist */
  }
}

/** Server HMAC secret, generated once and persisted (0600). */
export function getServerSecret(): Buffer {
  const file = secretFile();
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file);
  } catch {
    /* fall through to generation */
  }
  const secret = crypto.randomBytes(SECRET_BYTES);
  try {
    mkdirRecursive(file);
    fs.writeFileSync(file, secret, { mode: 0o600 });
  } catch (e) {
    log.error('Failed to persist auth secret', e as Error);
  }
  return secret;
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt ?? crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, usedSalt, 64).toString('hex');
  return { hash, salt: usedSalt };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  try {
    const { hash } = hashPassword(password, salt);
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signToken(username: string, admin: boolean, ttlMs: number = TOKEN_TTL_MS): string {
  const claims: SessionClaims = {
    sub: username,
    admin,
    iat: Date.now(),
    exp: Date.now() + ttlMs,
  };
  const payload = base64url(JSON.stringify(claims));
  const sig = crypto.createHmac('sha256', getServerSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto
    .createHmac('sha256', getServerSecret())
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as SessionClaims;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
    if (Date.now() > claims.exp) return null;
    // The user must still exist (deletion revokes sessions).
    if (!loadUsers().some((u) => u.username === claims.sub)) return null;
    return claims;
  } catch {
    return null;
  }
}

/** True once at least one user exists — auth is enforced from then on. */
export function isAuthEnabled(): boolean {
  return loadUsers().length > 0;
}

export function listUsers(): Array<Omit<UserRecord, 'passwordHash' | 'salt'>> {
  return loadUsers().map((u) => ({ username: u.username, admin: u.admin, createdAt: u.createdAt }));
}

export function validateUsername(username: unknown): string | null {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
    return 'username must be 3-32 chars: letters, digits, _ . -';
  }
  return null;
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'password must be 8-128 characters';
  }
  return null;
}

/**
 * Register a user. The very first user becomes admin and can be created
 * without a token (bootstrap). Afterwards registration requires an admin
 * token unless ALLOW_PUBLIC_REGISTER=1.
 */
export function registerUser(
  username: string,
  password: string,
  requester: SessionClaims | null,
): UserRecord {
  const usernameError = validateUsername(username);
  if (usernameError) throw new Error(usernameError);
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);

  const users = loadUsers();
  if (users.some((u) => u.username === username)) throw new Error('Username is taken');
  if (users.length > 0) {
    const publicRegister = process.env.ALLOW_PUBLIC_REGISTER === '1';
    if (!publicRegister && (!requester || !requester.admin)) {
      throw new Error('Registration requires an admin session');
    }
  }
  const { hash, salt } = hashPassword(password);
  const user: UserRecord = {
    username,
    passwordHash: hash,
    salt,
    admin: users.length === 0,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  log.server(`User registered: ${username}${user.admin ? ' (admin)' : ''}`);
  return user;
}

export function authenticateUser(username: string, password: string): UserRecord {
  const user = loadUsers().find((u) => u.username === username);
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    throw new Error('Invalid username or password');
  }
  return user;
}

export function deleteUser(username: string): boolean {
  const users = loadUsers();
  const remaining = users.filter((u) => u.username !== username);
  if (remaining.length === users.length) return false;
  if (remaining.length > 0 && !remaining.some((u) => u.admin)) {
    throw new Error('Cannot delete the last admin');
  }
  if (remaining.length === 0) {
    // Last user deleted: auth disables itself (back to single-user mode).
    try {
      fs.rmSync(storeFile(), { force: true });
    } catch {
      /* ignore */
    }
    return true;
  }
  saveUsers(remaining);
  return true;
}

/** Test hook: read the raw store path in use. */
export function authStoreFile(): string {
  return storeFile();
}
