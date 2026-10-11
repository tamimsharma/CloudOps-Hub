// Cryptographic utilities
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const BCRYPT_PREFIX = /^\$2[aby]\$/;

export function generateRandomString(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

export function generateUUID(): string {
  // RFC 4122 version 4 UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function hashString(str: string, algorithm: string = 'sha256'): string {
  return createHash(algorithm).update(str).digest('hex');
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

/**
 * Accepts bcrypt hashes (`$2a$…`, what the seed produces) and the legacy
 * `salt:sha256` format written by older rows, so existing accounts keep working.
 */
export function verifyPassword(password: string, hashed: string): boolean {
  if (!hashed) return false;

  if (BCRYPT_PREFIX.test(hashed)) {
    try {
      return bcrypt.compareSync(password, hashed);
    } catch {
      return false;
    }
  }

  const [salt, hash] = hashed.split(':');
  if (!salt || !hash) return false;
  const computedHash = createHash('sha256').update(password + salt).digest('hex');
  if (hash.length !== computedHash.length) return false;
  return timingSafeEqual(Buffer.from(hash), Buffer.from(computedHash));
}

export function generateToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}