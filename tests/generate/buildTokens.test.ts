import { describe, expect, it, vi } from "vitest";
import { bindToken, boundWorldId, claimToken, issueToken, MAX_CLAIMS, releaseToken, rotateToken, TTL_MS } from "@/generate/buildTokens";

const draft = () => false;
const published = () => true;

describe("build tokens", () => {
  it("issues a wb_ token that can be claimed", () => {
    const { token, expiresAt } = issueToken();
    expect(token).toMatch(/^wb_[0-9a-f]{8}$/);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(claimToken(token)).toBe("ok");
  });

  it("gives every token a distinct value", () => {
    expect(issueToken().token).not.toBe(issueToken().token);
  });

  // A drafting attempt that produces nothing must not cost the operator a trip to the console.
  it("hands a released claim back for another attempt", () => {
    const { token } = issueToken();
    expect(claimToken(token)).toBe("ok");
    releaseToken(token);
    expect(claimToken(token)).toBe("ok");
  });

  it("stops replaying a token that never produces a World", () => {
    const { token } = issueToken();
    for (let i = 0; i < MAX_CLAIMS; i++) {
      expect(claimToken(token)).toBe("ok");
      releaseToken(token);
      expect(claimToken(token)).toBe("ok");
    }
    expect(claimToken(token)).toBe("exhausted");
  });

  describe("bound to one World", () => {
    it("owns the first World it builds, and no other", () => {
      const { token } = issueToken();
      claimToken(token);
      bindToken(token, "northwind");
      bindToken(token, "somewhere-else"); // the first World wins
      expect(boundWorldId(token)).toBe("northwind");
    });

    it("stays claimable while that World is a draft, past the claim cap and past the hour", () => {
      vi.useFakeTimers();
      try {
        const { token } = issueToken();
        claimToken(token);
        bindToken(token, "northwind");

        // Redrafting the World it owns costs nobody else anything, so the cap does not apply.
        for (let i = 0; i < MAX_CLAIMS + 3; i++) expect(claimToken(token, draft)).toBe("ok");

        // A review can take longer than an hour. Publication ends a bound token, not the clock.
        vi.advanceTimersByTime(TTL_MS * 5);
        expect(claimToken(token, draft)).toBe("ok");
        expect(boundWorldId(token)).toBe("northwind");
      } finally {
        vi.useRealTimers();
      }
    });

    it("is spent the moment that World is published", () => {
      const { token } = issueToken();
      claimToken(token);
      bindToken(token, "northwind");
      expect(claimToken(token, published)).toBe("published");
      expect(boundWorldId(token)).toBe("northwind"); // still owns it; it just cannot write to it
    });

    it("cannot be released back into an unbound token", () => {
      const { token } = issueToken();
      claimToken(token);
      bindToken(token, "northwind");
      releaseToken(token);
      expect(boundWorldId(token)).toBe("northwind");
    });
  });

  describe("rotation", () => {
    it("retires the old token and issues a usable successor", () => {
      const { token } = issueToken();
      claimToken(token);
      bindToken(token, "northwind");

      const next = rotateToken(token);
      expect(next?.token).toMatch(/^wb_[0-9a-f]{8}$/);
      expect(next?.token).not.toBe(token);

      expect(claimToken(token, draft)).toBe("rotated");
      expect(boundWorldId(token)).toBeUndefined(); // it owns nothing it can write
      expect(claimToken(next!.token)).toBe("ok"); // the successor starts unbound and free
    });

    it("mints nothing on a second rotation, so re-saving a published World does not spray tokens", () => {
      const { token } = issueToken();
      claimToken(token);
      expect(rotateToken(token)).not.toBeNull();
      expect(rotateToken(token)).toBeNull();
      expect(rotateToken("wb_deadbeef")).toBeNull();
    });

    it("forgets a rotated token an hour after the rotation", () => {
      vi.useFakeTimers();
      try {
        const { token } = issueToken();
        claimToken(token);
        rotateToken(token);
        expect(claimToken(token)).toBe("rotated");
        vi.advanceTimersByTime(TTL_MS + 1000);
        expect(claimToken(token)).toBe("unknown");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("will not bind or release a token it never issued", () => {
    expect(() => bindToken("wb_deadbeef", "northwind")).not.toThrow();
    expect(() => releaseToken("wb_deadbeef")).not.toThrow();
    expect(boundWorldId("wb_deadbeef")).toBeUndefined();
    expect(claimToken("wb_deadbeef")).toBe("unknown");
    expect(claimToken("")).toBe("unknown");
  });

  it("refuses an unused token past its hour", () => {
    vi.useFakeTimers();
    try {
      const { token } = issueToken();
      vi.advanceTimersByTime(TTL_MS + 1000);
      expect(claimToken(token)).toBe("expired");
      expect(claimToken(token)).toBe("unknown"); // dropped on the way past
    } finally {
      vi.useRealTimers();
    }
  });
});
