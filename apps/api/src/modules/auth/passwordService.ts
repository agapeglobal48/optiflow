import argon2 from "argon2";

// argon2id is the current recommended variant - resistant to both
// GPU-cracking and side-channel attacks.
const HASH_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB, OWASP baseline recommendation
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash or verification error - treat as failed auth, never throw
    return false;
  }
}

const MIN_PASSWORD_LENGTH = 12;

export function validatePasswordStrength(plain: string): { valid: boolean; reason?: string } {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (!/[A-Z]/.test(plain) || !/[a-z]/.test(plain) || !/[0-9]/.test(plain)) {
    return { valid: false, reason: "Password must include upper, lower case letters and a number" };
  }
  return { valid: true };
}
