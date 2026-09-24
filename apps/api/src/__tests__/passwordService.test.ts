import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, validatePasswordStrength } from "../modules/auth/passwordService";

describe("passwordService", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("CorrectHorse123!");
    expect(await verifyPassword(hash, "CorrectHorse123!")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("CorrectHorse123!");
    expect(await verifyPassword(hash, "WrongPassword123!")).toBe(false);
  });

  it("never throws on a malformed hash, just returns false", async () => {
    await expect(verifyPassword("not-a-real-hash", "anything")).resolves.toBe(false);
  });

  it("rejects passwords under the minimum length", () => {
    expect(validatePasswordStrength("Short1!").valid).toBe(false);
  });

  it("rejects passwords missing character variety", () => {
    expect(validatePasswordStrength("alllowercase12").valid).toBe(false);
  });

  it("accepts a sufficiently strong password", () => {
    expect(validatePasswordStrength("StrongPassword123").valid).toBe(true);
  });
});
