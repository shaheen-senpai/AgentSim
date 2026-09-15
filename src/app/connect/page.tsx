// `/connect` — register your own agent and start a Run to point it at (spec §6.3). A Server
// Component: it reads the installed World packs and the agent registry directly (both touch the
// filesystem) and hands the client island plain, serialisable props. Everything the island does
// after that — register, edit, delete, create a Run, poll it — goes over the API.
import type { Metadata } from "next";
import { loadPacks, toPackOption, type PackOption } from "@/lib/summaries";
import { listAgents } from "@/runner/agentRegistry";
import { ConnectPage } from "@/ui/connect/ConnectPage";
import { Header } from "@/ui/Header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connect · AgentSim" };

/** A pack hand-edited into an invalid state is not startable, so it is not offered; `/worlds` reports it. */
const packs = (): PackOption[] => loadPacks().packs.map(toPackOption);

export default function ConnectRoute() {
  return (
    <div className="min-h-screen text-sm">
      <Header run={null} />
      <main className="p-4 flex flex-col gap-4 max-w-[1200px]">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-extrabold tracking-tight">Connect</h1>
          <p className="text-[12px] text-[#6b6b66]">
            Your agent, where it already lives — on your model, with your prompts. The only thing that changes is where its actions go.
          </p>
        </div>
        <ConnectPage packs={packs()} initialAgents={listAgents()} />
      </main>
    </div>
  );
}
