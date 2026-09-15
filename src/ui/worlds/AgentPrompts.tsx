// The Agents tab: the pack's Reference Agent system prompts, one per `agents/<version>.md`, shown
// verbatim. The prompt is the whole difference between the naive and fixed Reference Agents, so it
// is rendered as preformatted text rather than prose-wrapped markdown.
import { heading, mono } from "@/ui/styles";

export function AgentPrompts({ agents }: { agents: Record<string, string> }) {
  const versions = Object.keys(agents).sort();
  if (versions.length === 0) {
    return (
      <p className="text-[13px] text-[#6b6b66]">
        This World pack ships no Reference Agent prompts — a Run falls back to the repo&rsquo;s generic prompt (<span className={mono}>agents/generic.md</span>).
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {versions.map((version) => (
        <section key={version} className="bg-white border border-[#cfcfcb] rounded p-3 flex flex-col gap-1">
          <h2 className="flex items-baseline gap-2">
            <span className="font-semibold text-[13px]">{version}</span>
            <span className={`${mono} text-[11px] text-[#6b6b66]`}>agents/{version}.md</span>
          </h2>
          <div className={heading}>System prompt</div>
          <pre className={`${mono} text-[11.5px] whitespace-pre-wrap leading-snug bg-[#f4f4f2] border border-[#e6e6e2] rounded p-2 overflow-x-auto`}>
            {agents[version]}
          </pre>
        </section>
      ))}
    </div>
  );
}
