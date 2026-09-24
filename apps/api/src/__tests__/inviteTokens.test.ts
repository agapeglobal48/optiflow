import { describe, it, expect } from "vitest";
import { generateInviteToken, hashInviteToken, inviteExpiry } from "../modules/onboarding/inviteTokens";

describe("invite tokens", () => {
  it("generates a raw token whose hash matches hashInviteToken", () => {
    const { raw, hash } = generateInviteToken();
    expect(hashInviteToken(raw)).toBe(hash);
  });

  it("generates a different token on every call", () => {
    const first = generateInviteToken();
    const second = generateInviteToken();
    expect(first.raw).not.toBe(second.raw);
  });

  it("hashing is deterministic for the same input", () => {
    const { raw } = generateInviteToken();
    expect(hashInviteToken(raw)).toBe(hashInviteToken(raw));
  });

  it("defaults to a 7-day expiry in the future", () => {
    const now = Date.now();
    const expiry = inviteExpiry();
    const diffDays = (expiry.getTime() - now) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  it("respects a custom expiry window", () => {
    const now = Date.now();
    const expiry = inviteExpiry(1);
    const diffDays = (expiry.getTime() - now) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(0.9);
    expect(diffDays).toBeLessThan(1.1);
  });
});
