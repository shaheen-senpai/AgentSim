import { afterEach, describe, expect, it } from "vitest";
import { guardMcpRequest } from "@/lib/mcpAccess";

const request = (host: string) => new Request(`http://${host}/mcp/worlds`, { method: "POST", headers: { host } });

afterEach(() => {
  delete process.env.AGENTSIM_ALLOWED_HOSTS;
});

describe("guardMcpRequest", () => {
  it("passes localhost through with a null response", () => {
    expect(guardMcpRequest(request("127.0.0.1:3000"))).toBeNull();
    expect(guardMcpRequest(request("localhost:3000"))).toBeNull();
  });

  it("rejects an arbitrary hostname with a 403 by default", async () => {
    const rejected = guardMcpRequest(request("agentsim.loca.lt"));
    expect(rejected).not.toBeNull();
    expect(rejected!.status).toBe(403);
  });

  it("accepts a hostname named in AGENTSIM_ALLOWED_HOSTS", () => {
    process.env.AGENTSIM_ALLOWED_HOSTS = "agentsim.loca.lt, 192.168.1.24";
    expect(guardMcpRequest(request("agentsim.loca.lt"))).toBeNull();
    expect(guardMcpRequest(request("192.168.1.24:3000"))).toBeNull();
  });

  it("widens nothing else", () => {
    process.env.AGENTSIM_ALLOWED_HOSTS = "agentsim.loca.lt";
    expect(guardMcpRequest(request("someone-else.example.com"))).not.toBeNull();
  });

  it("is read per call, so a blank value changes nothing", () => {
    process.env.AGENTSIM_ALLOWED_HOSTS = "  , ,";
    expect(guardMcpRequest(request("agentsim.loca.lt"))).not.toBeNull();
  });
});
