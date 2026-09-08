import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  authenticateUser,
  deleteUser,
  hashPassword,
  isAuthEnabled,
  listUsers,
  registerUser,
  signToken,
  validatePassword,
  validateUsername,
  verifyPassword,
  verifyToken,
} from '../src/auth';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-auth-'));
  process.env.AUTH_STORE_FILE = path.join(dir, 'users.json');
  process.env.AUTH_SECRET_FILE = path.join(dir, '.auth-secret');
});

afterEach(() => {
  delete process.env.AUTH_STORE_FILE;
  delete process.env.AUTH_SECRET_FILE;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('password hashing', () => {
  it('verifies correct passwords and rejects wrong ones', () => {
    const { hash, salt } = hashPassword('correct-horse-123');
    expect(verifyPassword('correct-horse-123', salt, hash)).toBe(true);
    expect(verifyPassword('wrong', salt, hash)).toBe(false);
    expect(verifyPassword('correct-horse-123', salt, 'deadbeef')).toBe(false);
  });
});

describe('validation', () => {
  it('rejects bad usernames and short passwords', () => {
    expect(validateUsername('ab')).toMatch(/3-32/);
    expect(validateUsername('has space')).not.toBeNull();
    expect(validateUsername('alice_1')).toBeNull();
    expect(validatePassword('short')).toMatch(/8-128/);
    expect(validatePassword('long-enough-pass')).toBeNull();
  });
});

describe('registration', () => {
  it('is open until the first user exists; first user is admin', () => {
    expect(isAuthEnabled()).toBe(false);
    const admin = registerUser('alice', 'password-123', null);
    expect(admin.admin).toBe(true);
    expect(isAuthEnabled()).toBe(true);
    expect(listUsers()).toEqual([
      { username: 'alice', admin: true, createdAt: expect.any(String) },
    ]);
  });

  it('requires an admin session afterwards', () => {
    registerUser('alice', 'password-123', null);
    expect(() => registerUser('bob', 'password-123', null)).toThrow(/admin/);
    expect(() =>
      registerUser('bob', 'password-123', { sub: 'alice', admin: false, iat: 0, exp: 1 }),
    ).toThrow(/admin/);
    const bob = registerUser('bob', 'password-123', { sub: 'alice', admin: true, iat: 0, exp: 1 });
    expect(bob.admin).toBe(false);
  });

  it('rejects duplicates', () => {
    registerUser('alice', 'password-123', null);
    expect(() =>
      registerUser('alice', 'other-pass-1', {
        sub: 'alice',
        admin: true,
        iat: 0,
        exp: 1,
      }),
    ).toThrow(/taken/);
  });
});

describe('login and tokens', () => {
  it('authenticates and issues verifiable tokens', () => {
    registerUser('alice', 'password-123', null);
    const user = authenticateUser('alice', 'password-123');
    expect(user.username).toBe('alice');
    expect(() => authenticateUser('alice', 'nope-nope-nope')).toThrow(/Invalid/);
    expect(() => authenticateUser('nobody', 'password-123')).toThrow(/Invalid/);

    const token = signToken('alice', true);
    expect(verifyToken(token)).toMatchObject({ sub: 'alice', admin: true });
    expect(verifyToken(token + 'tampered')).toBeNull();
    expect(verifyToken('not-a-token')).toBeNull();
  });

  it('rejects expired tokens and deleted users', () => {
    registerUser('alice', 'password-123', null);
    expect(verifyToken(signToken('alice', true, -1000))).toBeNull();
    const token = signToken('alice', true);
    expect(verifyToken(token)).not.toBeNull();
    deleteUser('alice');
    expect(verifyToken(token)).toBeNull();
    expect(isAuthEnabled()).toBe(false);
  });

  it('refuses to delete the last admin while others remain', () => {
    registerUser('alice', 'password-123', null);
    registerUser('bob', 'password-123', { sub: 'alice', admin: true, iat: 0, exp: 1 });
    expect(() => deleteUser('alice')).toThrow(/last admin/);
  });
});
