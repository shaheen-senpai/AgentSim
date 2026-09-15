// Exercises the World pack API by invoking the exported route handlers directly against a temp packs dir.
import { beforeAll, describe, expect, it } from "vitest";
import { GET as listWorldsRoute, POST as createWorldRoute } from "@/app/api/worlds/route";
import { GET as getWorldRoute, PUT as putWorldRoute } from "@/app/api/worlds/[id]/route";
import { POST as validateRoute } from "@/app/api/worlds/validate/route";
import { loadPack, type PackFiles, type ValidationError, type WorldPack } from "@/engine/pack";
import type { PackSummary } from "@/lib/summaries";
import { usePacksDir } from "../helpers/packs";

const post = (url: string, body: unknown) => new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const put = (url: string, body: unknown) => new Request(url, { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Northwind's files with its pack id rewritten, so each test can create its own copy. */
function filesAs(id: string): PackFiles {
  const files = { ...loadPack("northwind").files };
  files["pack.yaml"] = files["pack.yaml"].replace(/^id: northwind$/m, `id: ${id}`);
  return files;
}

beforeAll(() => {
  usePacksDir();
});

describe("GET /api/worlds", () => {
  it("summarises every installed pack", async () => {
    const res = await listWorldsRoute();
    expect(res.status).toBe(200);
    const packs = (await res.json()) as PackSummary[];
    expect(packs).toContainEqual({
      id: "northwind",
      name: "Northwind Outfitters",
      domain: "support-commerce",
      description: "A small outdoor-gear shop. Support, email, orders and payments share one World.",
      principal: "customers",
      collections: 7,
      rows: 22,
      tools: 10,
      scenarios: 1,
    });
  });
});

describe("GET /api/worlds/:id", () => {
  it("returns the full parsed pack including its raw file texts", async () => {
    const res = await getWorldRoute(new Request("http://localhost/api/worlds/northwind"), ctx("northwind"));
    expect(res.status).toBe(200);
    const { pack } = (await res.json()) as { pack: WorldPack };
    expect(pack.meta.id).toBe("northwind");
    expect(pack.scenarios.map((s) => s.id)).toEqual(["duplicate-charge-refund"]);
    expect(Object.keys(pack.tools)).toContain("issue_refund");
    expect(pack.files["pack.yaml"]).toContain("id: northwind");
    expect(pack.files["scenarios/duplicate-charge-refund.yaml"]).toContain("task_brief");
    expect(Object.keys(pack.agents).sort()).toEqual(["fixed", "naive"]);
  });

  it("404s an unknown pack and refuses a traversal id without touching the filesystem", async () => {
    expect((await getWorldRoute(new Request("http://localhost/api/worlds/nope"), ctx("nope"))).status).toBe(404);
    expect((await getWorldRoute(new Request("http://localhost/api/worlds/x"), ctx("../../etc"))).status).toBe(400);
  });
});

describe("POST /api/worlds/validate", () => {
  it("always answers 200, with ok true for a good file set", async () => {
    const res = await validateRoute(post("http://localhost/api/worlds/validate", { files: filesAs("northwind") }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, errors: [] });
  });

  it("always answers 200, listing the problems for a bad file set", async () => {
    const files = filesAs("northwind");
    files["tools.yaml"] = "get_ticket: { system: nope, kind: read, description: x, op: get, collection: tickets, id: x, subject: { collection: tickets, id: x } }";
    const res = await validateRoute(post("http://localhost/api/worlds/validate", { files }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; errors: ValidationError[] };
    expect(body.ok).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors[0]).toMatchObject({ file: expect.any(String), path: expect.any(String), message: expect.any(String) });

    const broken = await validateRoute(post("http://localhost/api/worlds/validate", { files: { "pack.yaml": "id: [" } }));
    expect(broken.status).toBe(200);
    expect(((await broken.json()) as { ok: boolean }).ok).toBe(false);
  });

  it("400s a body that is not a file map", async () => {
    expect((await validateRoute(post("http://localhost/api/worlds/validate", { files: "nope" }))).status).toBe(400);
  });
});

describe("POST /api/worlds", () => {
  it("creates a pack, then refuses to create it again", async () => {
    const res = await createWorldRoute(post("http://localhost/api/worlds", { id: "copperfield", files: filesAs("copperfield") }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "copperfield", name: "Northwind Outfitters" });

    const listed = (await (await listWorldsRoute()).json()) as PackSummary[];
    expect(listed.map((p) => p.id).sort()).toEqual(["copperfield", "northwind"]);

    const again = await createWorldRoute(post("http://localhost/api/worlds", { id: "copperfield", files: filesAs("copperfield") }));
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBeTruthy();
  });

  it("400s invalid files with the validation errors, and never writes them", async () => {
    const files = filesAs("brokenworld");
    files["seed.yaml"] = "now: 2026-01-01T00:00:00Z\ncurrency: GBP\nrows: { customers: [ { id: cus_1 } ] }";
    const res = await createWorldRoute(post("http://localhost/api/worlds", { id: "brokenworld", files }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors: ValidationError[] };
    expect(body.errors.length).toBeGreaterThan(0);

    const listed = (await (await listWorldsRoute()).json()) as PackSummary[];
    expect(listed.map((p) => p.id)).not.toContain("brokenworld");
  });

  it("400s a pack id the file set disagrees with, and a malformed id", async () => {
    const mismatch = await createWorldRoute(post("http://localhost/api/worlds", { id: "mismatched", files: filesAs("something-else") }));
    expect(mismatch.status).toBe(400);
    expect(((await mismatch.json()) as { errors: ValidationError[] }).errors[0]).toMatchObject({ file: "pack.yaml", path: "id" });

    expect((await createWorldRoute(post("http://localhost/api/worlds", { id: "../escape", files: filesAs("x") }))).status).toBe(400);
    expect((await createWorldRoute(post("http://localhost/api/worlds", { files: filesAs("x") }))).status).toBe(400);
  });
});

describe("PUT /api/worlds/:id", () => {
  it("overwrites an existing pack", async () => {
    await createWorldRoute(post("http://localhost/api/worlds", { id: "editable", files: filesAs("editable") }));

    const files = filesAs("editable");
    files["pack.yaml"] = files["pack.yaml"].replace("name: Northwind Outfitters", "name: Editable Outfitters");
    const res = await putWorldRoute(put("http://localhost/api/worlds/editable", { files }), ctx("editable"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "editable", name: "Editable Outfitters" });
    expect(loadPack("editable").meta.name).toBe("Editable Outfitters");
  });

  it("404s an unknown pack, 400s invalid files and leaves the pack on disk untouched", async () => {
    expect((await putWorldRoute(put("http://localhost/api/worlds/ghost", { files: filesAs("ghost") }), ctx("ghost"))).status).toBe(404);

    const files = filesAs("editable");
    files["tools.yaml"] = "get_ticket: 3";
    const res = await putWorldRoute(put("http://localhost/api/worlds/editable", { files }), ctx("editable"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { errors: ValidationError[] }).errors.length).toBeGreaterThan(0);
    expect(loadPack("editable").meta.name).toBe("Editable Outfitters"); // unchanged
  });
});
