import { describe, expect, it, vi } from "vitest";
import { driveRemoteAgent } from "@/runner/remoteAgent";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("driveRemoteAgent", () => {
  it("posts the Run id and Task Brief, and returns the agent's reply", async () => {
    const fetchImpl = vi.fn(async () => ok({ reply: "Refunded the duplicate charge." }));
    const out = await driveRemoteAgent("http://localhost:4000/agentsim", { runId: "run_1", taskBrief: "Handle tkt_1001.", fetchImpl });
    expect(out.reply).toBe("Refunded the duplicate charge.");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:4000/agentsim");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ runId: "run_1", taskBrief: "Handle tkt_1001.", messages: [] });
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("sends an Authorization header when one is configured, and none when it is not", async () => {
    const fetchImpl = vi.fn(async () => ok({ reply: "ok" }));
    await driveRemoteAgent("http://localhost:4000", { runId: "r", taskBrief: "t", authHeader: "Bearer abc", fetchImpl });
    expect(new Headers((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get("authorization")).toBe("Bearer abc");

    const plain = vi.fn(async () => ok({ reply: "ok" }));
    await driveRemoteAgent("http://localhost:4000", { runId: "r", taskBrief: "t", fetchImpl: plain });
    expect(new Headers((plain.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get("authorization")).toBeNull();
  });

  it("refuses a URL the guard rejects, before making any request", async () => {
    const fetchImpl = vi.fn(async () => ok({ reply: "ok" }));
    await expect(driveRemoteAgent("https://internal.corp/x", { runId: "r", taskBrief: "t", fetchImpl })).rejects.toThrow(/not an allowed agent host/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses to follow a redirect, which would otherwise carry the request past the host guard", async () => {
    // The guard checks the URL we were given. `fetch` follows 3xx by default and re-validates
    // nothing, so an allowed endpoint could bounce us onto cloud metadata or a private address and
    // the body would come back in the Run. Manual redirect turns that into a visible failure.
    const fetchImpl = vi.fn(async () => new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }));
    await expect(driveRemoteAgent("http://localhost:4000", { runId: "r", taskBrief: "t", fetchImpl })).rejects.toThrow(/redirect/i);
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe("manual");
  });

  it("reports a failing status with the body, so the cause is visible in the Run", async () => {
    const fetchImpl = vi.fn(async () => new Response("no such route", { status: 404 }));
    await expect(driveRemoteAgent("http://localhost:4000", { runId: "r", taskBrief: "t", fetchImpl })).rejects.toThrow(/404[\s\S]*no such route/);
  });

  it("rejects a reply that is not JSON, or that carries no reply string", async () => {
    const notJson = vi.fn(async () => new Response("<html>oops</html>", { status: 200 }));
    await expect(driveRemoteAgent("http://localhost:4000", { runId: "r", taskBrief: "t", fetchImpl: notJson })).rejects.toThrow(/did not return JSON/);

    const noReply = vi.fn(async () => ok({ output: "wrong key" }));
    await expect(driveRemoteAgent("http://localhost:4000", { runId: "r", taskBrief: "t", fetchImpl: noReply })).rejects.toThrow(/reply/);
  });

  it("passes an abort signal so a hung agent cannot hold a Run open forever", async () => {
    const fetchImpl = vi.fn(async () => ok({ reply: "ok" }));
    await driveRemoteAgent("http://localhost:4000", { runId: "r", taskBrief: "t", timeoutMs: 5000, fetchImpl });
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });
});
