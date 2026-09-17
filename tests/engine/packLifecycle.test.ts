// The pack.yaml fields this feature added — `status`, `mandates`, `built_by` — and the two rules
// that hang off them: a Scenario may cite a Mandate instead of copying it, and a World cannot claim
// to be published while nothing in it is tested.
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { deletePack, loadPack, packsDir, parsePackFiles, savePack, type PackFiles } from "@/engine/pack";
import { copyFixturePacks } from "../helpers/packs";

let northwind: PackFiles;

beforeAll(() => {
  copyFixturePacks();
  northwind = loadPack("northwind").files;
});

/** Northwind with `mandates:` declared and its Scenario citing one instead of carrying its own text. */
function withMandate(): PackFiles {
  const files = { ...northwind };
  files["pack.yaml"] = `${files["pack.yaml"]}mandates:\n  refund-limits:\n    title: Refund limits\n    text: |\n      Refund only a duplicate charge, up to the amount duplicated.\n`;
  files["scenarios/duplicate-charge-refund.yaml"] = files["scenarios/duplicate-charge-refund.yaml"].replace(
    /policy:\n(?:  .*\n)+?(?=\ncheck)/,
    "policy: { mandate: refund-limits }\n",
  );
  return files;
}

describe("status", () => {
  it("defaults to ready, so a pack written before the field existed stays runnable", () => {
    const { pack, errors } = parsePackFiles(northwind);
    expect(errors).toEqual([]);
    expect(pack!.meta.status).toBe("ready");
  });

  it("reads draft when the pack says so", () => {
    const files = { ...northwind, "pack.yaml": `status: draft\n${northwind["pack.yaml"]}` };
    expect(parsePackFiles(files).pack!.meta.status).toBe("draft");
  });

  it("refuses `ready` with no Scenarios — nothing in it is tested, so it cannot have been reviewed", () => {
    const files = { ...northwind };
    delete files["scenarios/duplicate-charge-refund.yaml"];
    const { pack, errors } = parsePackFiles(files);
    expect(pack).toBeNull();
    expect(errors).toContainEqual({
      file: "pack.yaml",
      path: "status",
      message: "a World marked ready must have at least one Scenario — leave it a draft until it has one",
    });
  });

  it("allows a draft with no Scenarios and an empty Seed — what the plugin builds", () => {
    const files: PackFiles = {
      "pack.yaml": `status: draft\n${northwind["pack.yaml"]}`,
      "tools.yaml": northwind["tools.yaml"],
      // Every declared collection still needs its key; the rows come later, on the platform.
      "seed.yaml": `now: 2026-09-18T09:00:00Z\ncurrency: GBP\nrows:\n${["customers", "orders", "payments", "refunds", "threads", "emails", "tickets"].map((c) => `  ${c}: []\n`).join("")}`,
    };
    const { pack, errors } = parsePackFiles(files);
    expect(errors).toEqual([]);
    expect(pack!.scenarios).toEqual([]);
    expect(pack!.seed.rows.customers).toEqual([]);
  });
});

describe("mandates", () => {
  it("defaults to none, and a Scenario's inline policy text still parses", () => {
    const { pack } = parsePackFiles(northwind);
    expect(pack!.meta.mandates).toEqual({});
    expect(pack!.scenarios[0].policy.text).toContain("refund");
    expect(pack!.scenarios[0].policy.mandate).toBeUndefined();
  });

  it("resolves a cited Mandate to its text, and says which one it came from", () => {
    const { pack, errors } = parsePackFiles(withMandate());
    expect(errors).toEqual([]);
    expect(pack!.meta.mandates["refund-limits"]).toEqual({
      id: "refund-limits",
      title: "Refund limits",
      text: "Refund only a duplicate charge, up to the amount duplicated.\n",
    });
    expect(pack!.scenarios[0].policy.mandate).toBe("refund-limits");
    expect(pack!.scenarios[0].policy.text).toBe("Refund only a duplicate charge, up to the amount duplicated.\n");
  });

  it("errors on a citation the pack does not declare, rather than an empty policy", () => {
    const files = withMandate();
    files["scenarios/duplicate-charge-refund.yaml"] = files["scenarios/duplicate-charge-refund.yaml"].replace("refund-limits", "no-such-mandate");
    const { pack, errors } = parsePackFiles(files);
    expect(pack).toBeNull();
    expect(errors).toContainEqual({
      file: "scenarios/duplicate-charge-refund.yaml",
      path: "policy.mandate",
      message: "mandate 'no-such-mandate' is not declared in pack.yaml",
    });
  });

  it("rejects a policy that is neither text nor a citation", () => {
    const files = { ...northwind };
    files["scenarios/duplicate-charge-refund.yaml"] = files["scenarios/duplicate-charge-refund.yaml"].replace(
      /policy:\n(?:  .*\n)+?(?=\ncheck)/,
      "policy: { text: hi, mandate: refund-limits }\n",
    );
    expect(parsePackFiles(files).pack).toBeNull();
  });
});

describe("built_by", () => {
  it("carries the run that built the World", () => {
    const built = "built_by:\n  source: plugin\n  run: draft_7b40de\n  token: wb_3ac81f52\n  client: claude-code 2.0.9\n  repo: github.com/acme/bot@a1b2c3d\n  at: 2026-09-18T10:04:00Z\n";
    const { pack, errors } = parsePackFiles({ ...northwind, "pack.yaml": `${northwind["pack.yaml"]}${built}` });
    expect(errors).toEqual([]);
    expect(pack!.meta.built_by).toEqual({
      source: "plugin",
      run: "draft_7b40de",
      token: "wb_3ac81f52",
      client: "claude-code 2.0.9",
      repo: "github.com/acme/bot@a1b2c3d",
      at: "2026-09-18T10:04:00Z",
    });
  });

  it("rejects a source it does not know", () => {
    const { pack } = parsePackFiles({ ...northwind, "pack.yaml": `${northwind["pack.yaml"]}built_by: { source: somewhere, at: now }\n` });
    expect(pack).toBeNull();
  });
});

describe("deletePack", () => {
  it("removes the pack directory", () => {
    savePack("throwaway", { ...northwind, "pack.yaml": northwind["pack.yaml"].replace("id: northwind", "id: throwaway") });
    expect(existsSync(path.join(packsDir(), "throwaway", "pack.yaml"))).toBe(true);

    deletePack("throwaway");
    expect(existsSync(path.join(packsDir(), "throwaway"))).toBe(false);
  });

  it("refuses an id that could escape the packs directory", () => {
    expect(() => deletePack("../../etc")).toThrow(/Invalid pack id/);
  });
});
