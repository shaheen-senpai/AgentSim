import { issueToken } from "@/generate/buildTokens";

export const dynamic = "force-dynamic";

/**
 * Issues a build token for one worldbuilder plugin run. POST-only and unauthenticated in the same
 * way the rest of this console is — the point is that the token has to come from *here*, so
 * drafting a World over `/mcp/worlds` needs console access rather than mere reachability.
 */
export async function POST() {
  return Response.json(issueToken(), { status: 201 });
}
