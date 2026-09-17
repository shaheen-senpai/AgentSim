import { describe, expect, it } from "vitest";
import { relativeTime } from "@/ui/relativeTime";

const now = Date.UTC(2026, 8, 17, 12, 0, 0);

describe("relativeTime", () => {
  it("rounds down into the mock's four buckets", () => {
    expect(relativeTime("2026-09-17T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-09-17T11:45:00Z", now)).toBe("15 min ago");
    expect(relativeTime("2026-09-17T09:10:00Z", now)).toBe("2 h ago");
    expect(relativeTime("2026-09-14T12:00:00Z", now)).toBe("3 d ago");
  });
  it("treats a future or unparseable time as just now", () => {
    expect(relativeTime("2026-09-18T00:00:00Z", now)).toBe("just now");
    expect(relativeTime("garbage", now)).toBe("just now");
  });
});
