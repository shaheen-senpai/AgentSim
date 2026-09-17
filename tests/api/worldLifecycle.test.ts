// The review gate, end to end over the real route handlers: a created World is a draft, a draft
// cannot be run, publishing needs a Scenario, and discarding is only ever a draft with no Runs.
import { beforeAll, describe, expect, it } from "vitest";
import { POST as createWorldRoute } from "@/app/api/worlds/route";
import { DELETE as deleteWorldRoute, PUT as putWorldRoute } from "@/app/api/worlds/[id]/route";
import { POST as createRunRoute } from "@/app/api/runs/route";
import { listPackIds, loadPack, type PackFiles } from "@/engine/pack";
import { withPackStatus } from "@/ui/worlds/packEdits";
import { usePacksDir } from "../helpers/packs";

const post = (url: string, body: unknown) => new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const put = (url: string, body: unknown) => new Request(url, { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Northwind's files under a new id, so each test can create its own World. */
function filesAs(id: string): PackFiles {
  const files = { ...loadPack("northwind").files };
  files["pack.yaml"] = files["pack.yaml"].replace(/^id: northwind$/m, `id: ${id}`);
  return files;
}

async function create(id: string, extra: Record<string, unknown> = {}): Promise<Response> {
  return createWorldRoute(post("http://localhost/api/worlds", { id, files: filesAs(id), ...extra }));
}

beforeAll(() => {
  usePacksDir();
});

describe("POST /api/worlds", () => {
  it("creates every World as a draft, whatever the caller asked for", async () => {
    // The files say `ready` — the route overrides it, because this is the one place every create
    // routes through and a runnable World nobody reviewed is the thing being prevented.
    const files = filesAs("forced-draft");
    files["pack.yaml"] = withPackStatus(files["pack.yaml"], "ready");
    const res = await createWorldRoute(post("http://localhost/api/worlds", { id: "forced-draft", files }));

    expect(res.status).toBe(201);
    expect(loadPack("forced-draft").meta.status).toBe("draft");
  });

  it("records what built it, defaulting to the console", async () => {
    await create("built-here");
    const built = loadPack("built-here").meta.built_by!;
    expect(built.source).toBe("console");
    expect(built.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await create("built-by-plugin", { builtBy: { source: "plugin", run: "draft_abc", token: "wb_1234abcd", client: "claude-code 2.0.9", repo: "github.com/acme/bot@a1b2c3d" } });
    expect(loadPack("built-by-plugin").meta.built_by).toMatchObject({ source: "plugin", run: "draft_abc", repo: "github.com/acme/bot@a1b2c3d" });
  });
});

describe("publishing", () => {
  it("is a PUT that sets status ready, and makes the World runnable", async () => {
    await create("to-publish");
    const files = loadPack("to-publish").files;

    const res = await putWorldRoute(put("http://localhost/api/worlds/to-publish", { files: { ...files, "pack.yaml": withPackStatus(files["pack.yaml"], "ready") } }), ctx("to-publish"));
    expect(res.status).toBe(200);
    expect(loadPack("to-publish").meta.status).toBe("ready");
  });

  it("is refused while the World has no Scenarios", async () => {
    const files = filesAs("empty-world");
    delete files["scenarios/duplicate-charge-refund.yaml"];
    files["pack.yaml"] = withPackStatus(files["pack.yaml"], "draft");
    await createWorldRoute(post("http://localhost/api/worlds", { id: "empty-world", files }));

    const published = { ...loadPack("empty-world").files };
    published["pack.yaml"] = withPackStatus(published["pack.yaml"], "ready");
    const res = await putWorldRoute(put("http://localhost/api/worlds/empty-world", { files: published }), ctx("empty-world"));

    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("must have at least one Scenario");
    expect(loadPack("empty-world").meta.status).toBe("draft"); // nothing was written
  });
});

describe("POST /api/runs", () => {
  it("refuses a draft World, so a deep link cannot start a Run nobody reviewed", async () => {
    await create("not-reviewed");
    const res = await createRunRoute(
      post("http://localhost/api/runs", { packId: "not-reviewed", scenarioId: "duplicate-charge-refund", agent: { kind: "byo", agentId: null }, attackId: null }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/still in review/);
  });

  it("accepts it once published", async () => {
    await create("reviewed");
    const files = loadPack("reviewed").files;
    await putWorldRoute(put("http://localhost/api/worlds/reviewed", { files: { ...files, "pack.yaml": withPackStatus(files["pack.yaml"], "ready") } }), ctx("reviewed"));

    const res = await createRunRoute(
      post("http://localhost/api/runs", { packId: "reviewed", scenarioId: "duplicate-charge-refund", agent: { kind: "byo", agentId: null }, attackId: null }),
    );
    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/worlds/:id", () => {
  it("discards a draft World", async () => {
    await create("to-discard");
    const res = await deleteWorldRoute(new Request("http://localhost/api/worlds/to-discard", { method: "DELETE" }), ctx("to-discard"));
    expect(res.status).toBe(200);
    expect(listPackIds()).not.toContain("to-discard");
  });

  it("refuses a published World", async () => {
    await create("published");
    const files = loadPack("published").files;
    await putWorldRoute(put("http://localhost/api/worlds/published", { files: { ...files, "pack.yaml": withPackStatus(files["pack.yaml"], "ready") } }), ctx("published"));

    const res = await deleteWorldRoute(new Request("http://localhost/api/worlds/published", { method: "DELETE" }), ctx("published"));
    expect(res.status).toBe(409);
    expect(listPackIds()).toContain("published");
  });

  it("refuses a draft that Runs point at, and 404s an unknown World", async () => {
    await create("has-runs");
    const files = loadPack("has-runs").files;
    await putWorldRoute(put("http://localhost/api/worlds/has-runs", { files: { ...files, "pack.yaml": withPackStatus(files["pack.yaml"], "ready") } }), ctx("has-runs"));
    await createRunRoute(post("http://localhost/api/runs", { packId: "has-runs", scenarioId: "duplicate-charge-refund", agent: { kind: "byo", agentId: null }, attackId: null }));
    // Back to a draft, the way a hand edit could: the Run still makes it undeletable.
    const current = loadPack("has-runs").files;
    await putWorldRoute(put("http://localhost/api/worlds/has-runs", { files: { ...current, "pack.yaml": withPackStatus(current["pack.yaml"], "draft") } }), ctx("has-runs"));

    const res = await deleteWorldRoute(new Request("http://localhost/api/worlds/has-runs", { method: "DELETE" }), ctx("has-runs"));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/Run/);

    expect((await deleteWorldRoute(new Request("http://localhost/api/worlds/nope", { method: "DELETE" }), ctx("nope"))).status).toBe(404);
  });
});
