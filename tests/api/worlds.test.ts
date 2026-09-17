// Exercises the World pack API by invoking the exported route handlers directly against a temp packs dir.
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as listWorldsRoute, POST as createWorldRoute } from "@/app/api/worlds/route";
import { GET as getWorldRoute, PUT as putWorldRoute } from "@/app/api/worlds/[id]/route";
import { POST as validateRoute } from "@/app/api/worlds/validate/route";
import { listPackIds, loadPack, type PackFiles, type ValidationError, type WorldPack } from "@/engine/pack";
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

let packsDir: string;
beforeAll(() => {
  packsDir = usePacksDir();
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
      tools: 9,
      scenarios: 1,
      systems: 4,
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
    expect(Object.keys(pack.tools)).toContain("create_refund");
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

  it("refuses a file name outside the pack layout and writes nothing", async () => {
    // Every key is joined onto the pack directory, so an unchecked one writes anywhere on disk.
    const escaped = `ESCAPED-${process.pid}-${Date.now()}.txt`;
    const before = readdirSync(packsDir).sort(); // this file's own packs dir, so ordering-independent

    for (const key of [`../../${escaped}`, "../sibling/pack.yaml", "/etc/passwd", "scenarios/../../x.yaml", "agents/../evil.md", "README.md"]) {
      const res = await createWorldRoute(post("http://localhost/api/worlds", { id: "escapee", files: { ...filesAs("escapee"), [key]: "pwned" } }));
      expect(res.status, key).toBe(400);
      const body = (await res.json()) as { errors: ValidationError[] };
      expect(body.errors.some((e) => e.file === key), key).toBe(true);
    }

    // `../../<name>` lands beside the packs dir, `../sibling/…` inside it — check both exactly, never
    // the shared temp root's listing, which other test files mutate while this one runs.
    expect(existsSync(path.join(packsDir, "..", escaped))).toBe(false);
    expect(existsSync(path.join(packsDir, "sibling"))).toBe(false);
    expect(existsSync(path.join(packsDir, "escapee"))).toBe(false);
    expect(readdirSync(packsDir).sort()).toEqual(before);

    // and the same key is refused on the update path
    await createWorldRoute(post("http://localhost/api/worlds", { id: "guarded", files: filesAs("guarded") }));
    const put400 = await putWorldRoute(put("http://localhost/api/worlds/guarded", { files: { ...filesAs("guarded"), [`../../${escaped}`]: "pwned" } }), ctx("guarded"));
    expect(put400.status).toBe(400);
    expect(existsSync(path.join(packsDir, "..", escaped))).toBe(false);
    expect(readdirSync(path.join(packsDir, "guarded")).sort()).toEqual(["agents", "pack.yaml", "scenarios", "seed.yaml", "tools.yaml"]);
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
  /** Each test creates and renames its own pack: nothing here may depend on another test's leftovers. */
  async function renamedPack(id: string, name: string): Promise<void> {
    expect((await createWorldRoute(post("http://localhost/api/worlds", { id, files: filesAs(id) }))).status).toBe(201);
    const files = filesAs(id);
    files["pack.yaml"] = files["pack.yaml"].replace("name: Northwind Outfitters", `name: ${name}`);
    const res = await putWorldRoute(put(`http://localhost/api/worlds/${id}`, { files }), ctx(id));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id, name });
  }

  it("overwrites an existing pack", async () => {
    await renamedPack("editable", "Editable Outfitters");
    expect(loadPack("editable").meta.name).toBe("Editable Outfitters");
  });

  it("404s an unknown pack, 400s invalid files and leaves the pack on disk untouched", async () => {
    expect((await putWorldRoute(put("http://localhost/api/worlds/ghost", { files: filesAs("ghost") }), ctx("ghost"))).status).toBe(404);

    await renamedPack("untouched", "Untouched Outfitters");
    const files = filesAs("untouched");
    files["tools.yaml"] = "get_ticket: 3";
    const res = await putWorldRoute(put("http://localhost/api/worlds/untouched", { files }), ctx("untouched"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { errors: ValidationError[] }).errors.length).toBeGreaterThan(0);
    expect(loadPack("untouched").meta.name).toBe("Untouched Outfitters"); // unchanged
  });
});

describe("GET /api/worlds resilience", () => {
  it("skips a pack that no longer loads instead of 500ing the whole list", async () => {
    await createWorldRoute(post("http://localhost/api/worlds", { id: "rotten", files: filesAs("rotten") }));
    // Break it the way a hand edit would — behind the API's back.
    writeFileSync(path.join(packsDir, "rotten", "tools.yaml"), "get_ticket: [unclosed", "utf8");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await listWorldsRoute();
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as PackSummary[]).map((p) => p.id);
    expect(ids).not.toContain("rotten");
    expect(ids).toContain("northwind");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    // the broken pack is still individually reachable, so it can be diagnosed
    expect(listPackIds()).toContain("rotten");
  });
});
