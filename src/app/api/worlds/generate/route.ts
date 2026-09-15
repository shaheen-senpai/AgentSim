import { z } from "zod";
import { generateWorldPack } from "@/generate/worldpack";

export const dynamic = "force-dynamic";
// One generation is a long Opus call with a retry; the default serverless ceiling is far too short.
export const maxDuration = 300;

const Body = z.object({
  name: z.string().trim().min(1),
  domain: z.string().trim().min(1),
  description: z.string().trim().min(1),
  schema: z.string().optional(),
  tools: z.string().optional(),
  openapi: z.string().optional(),
});

/**
 * Drafts a World pack with Claude (spec §6.2, §7). Deliberately POST-only and never reachable by a
 * page load or a prefetch: this is one of the few routes in the app that spend money (the others
 * are /mcp/worlds's register_agent and refine_world), and it writes nothing — the draft comes back
 * for a human to review in the editor and create explicitly.
 */
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not set, so a World pack cannot be generated. Add it to .env and restart the server, or start from a template instead." },
      { status: 503 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });

  try {
    const { files, errors, attempts } = await generateWorldPack(parsed.data);
    return Response.json({ files, errors, attempts });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[worlds/generate] ${message}`);
    return Response.json({ error: message }, { status: 502 });
  }
}
