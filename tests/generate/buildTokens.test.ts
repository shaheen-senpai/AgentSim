import { describe, expect, it, vi } from "vitest";
import { issueToken, spendToken, TTL_MS } from "@/generate/buildTokens";

describe("build tokens", () => {
  it("issues a wb_ token that can be spent exactly once", () => {
    const { token, expiresAt } = issueToken();
    expect(token).toMatch(/^wb_[0-9a-f]{8}$/);
    expect(expiresAt).toBeGreaterThan(Date.now());

    expect(spendToken(token)).toBe("ok");
    // Single use is the point: one token drafts one World, so a leaked one cannot be replayed.
    expect(spendToken(token)).toBe("spent");
  });

  it("gives every token a distinct value", () => {
    expect(issueToken().token).not.toBe(issueToken().token);
  });

  it("tells an unknown token apart from a spent one", () => {
    expect(spendToken("wb_deadbeef")).toBe("unknown");
    expect(spendToken("")).toBe("unknown");
  });

  it("refuses a token past its hour", () => {
    vi.useFakeTimers();
    try {
      const { token } = issueToken();
      vi.advanceTimersByTime(TTL_MS + 1000);
      expect(spendToken(token)).toBe("expired");
      expect(spendToken(token)).toBe("unknown"); // dropped on the way past
    } finally {
      vi.useRealTimers();
    }
  });
});
