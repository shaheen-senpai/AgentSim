import { afterEach, describe, expect, it } from "vitest";
import { assertAgentUrl } from "@/lib/agentEndpoint";

const ALLOW = "AGENTSIM_ALLOWED_AGENT_HOSTS";
afterEach(() => { delete process.env[ALLOW]; });

describe("assertAgentUrl", () => {
  it("accepts an agent on this machine", () => {
    expect(assertAgentUrl("http://localhost:4000/agentsim").href).toBe("http://localhost:4000/agentsim");
    expect(assertAgentUrl("http://127.0.0.1:4000").hostname).toBe("127.0.0.1");
  });

  it("refuses a host that was not named, so a registered agent cannot point us at the private network", () => {
    // Nothing authenticates POST /api/agents, so the URL we call is attacker-reachable input. This
    // is the same reasoning as the inbound /mcp guard, pointed the other way.
    expect(() => assertAgentUrl("http://169.254.169.254/latest/meta-data/")).toThrow(/not an allowed agent host/);
    expect(() => assertAgentUrl("https://internal.corp/agent")).toThrow(/not an allowed agent host/);
  });

  it("accepts a host the operator named", () => {
    process.env[ALLOW] = "staging.acme.test, other.test";
    expect(assertAgentUrl("https://staging.acme.test/agent").hostname).toBe("staging.acme.test");
  });

  it("refuses anything that is not http or https", () => {
    expect(() => assertAgentUrl("file:///etc/passwd")).toThrow(/http/);
    expect(() => assertAgentUrl("ftp://localhost/x")).toThrow(/http/);
  });

  it("refuses something that is not a URL at all", () => {
    expect(() => assertAgentUrl("not a url")).toThrow(/is not a valid URL/);
    expect(() => assertAgentUrl("")).toThrow(/is not a valid URL/);
  });
});
