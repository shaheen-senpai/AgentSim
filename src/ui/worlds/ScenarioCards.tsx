// The Scenarios tab: a card per Scenario — Task Brief, Policy, Checks grouped by Dimension, and
// the Attacks with their Lure. **Run this** hands the Launcher `?packId&scenarioId`, which it reads
// to preselect the World pack and Scenario (`src/ui/Launcher.tsx`).
import Link from "next/link";
import type { Attack, Scenario } from "@/engine/pack";
import { heading, mono } from "@/ui/styles";
import { checkParams, checksByDimension, lureSummary, mutationSummary, mutationText, runHref } from "./packView";

function AttackCard({ attack }: { attack: Attack }) {
  const planted = mutationText(attack.mutation);
  return (
    <article className="border border-[#B23A22] bg-[#FBEAE7] rounded p-2 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`${mono} text-[11px] text-[#B23A22] font-semibold`}>{attack.id}</span>
        <span className="text-[12px] font-semibold">{attack.title}</span>
      </div>
      <div className="text-[11px]">
        <span className={heading}>Mutation</span> <span className={mono}>{mutationSummary(attack.mutation)}</span>
      </div>
      {planted && (
        <pre className={`${mono} text-[11px] whitespace-pre-wrap bg-white border border-[#E3E0D5] rounded p-1.5 max-h-52 overflow-y-auto`}>{planted}</pre>
      )}
      <div className="text-[11px]">
        <span className={heading}>Lure</span> <span className={mono}>{lureSummary(attack.lure)}</span>
        <span className="text-[#6E6B60]"> — taking it is a Safety Violation.</span>
      </div>
    </article>
  );
}

export function ScenarioCard({ packId, scenario }: { packId: string; scenario: Scenario }) {
  const groups = checksByDimension(scenario.checks);
  return (
    <article className="bg-white border border-[#E3E0D5] rounded p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-semibold text-[15px]">{scenario.title}</h2>
        <span className={`${mono} text-[11px] text-[#6E6B60]`}>{scenario.id}</span>
        <div className="flex-1" />
        <Link
          href={runHref(packId, scenario.id)}
          className="text-[12px] font-semibold rounded bg-[#1B1A17] text-white px-3 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B1A17]"
        >
          ▷ Run this
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section>
          <h3 className={heading}>Task Brief</h3>
          <pre className="text-[12px] whitespace-pre-wrap font-sans mt-1 leading-snug">{scenario.task_brief.trim()}</pre>
        </section>
        <section>
          <h3 className={heading}>Policy</h3>
          <pre className="text-[12px] whitespace-pre-wrap font-sans mt-1 leading-snug">{scenario.policy.text.trim()}</pre>
        </section>
      </div>

      <section>
        <h3 className={heading}>Checks</h3>
        {groups.length === 0 ? (
          <p className="text-[12px] text-[#6E6B60] mt-1">No Checks — every Dimension scores 100 by default.</p>
        ) : (
          <div className="flex flex-col gap-2 mt-1">
            {groups.map((g) => (
              <div key={g.dimension}>
                <div className="text-[12px] font-semibold">
                  {g.label} <span className="text-[#6E6B60] font-normal">({g.checks.length})</span>
                </div>
                <ul className="flex flex-col gap-0.5 mt-0.5">
                  {g.checks.map((c, i) => (
                    <li key={`${c.type}-${i}`} className="text-[11px] border-l-2 border-[#E3E0D5] pl-2">
                      <span className={`${mono} font-semibold`}>{c.type}</span>{" "}
                      <span className={`${mono} text-[#6E6B60] break-words`}>{checkParams(c)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className={heading}>Attacks</h3>
        {scenario.attacks.length === 0 ? (
          <p className="text-[12px] text-[#6E6B60] mt-1">No Attacks — this Scenario only ever runs clean.</p>
        ) : (
          <div className="flex flex-col gap-2 mt-1">
            {scenario.attacks.map((a) => (
              <AttackCard key={a.id} attack={a} />
            ))}
          </div>
        )}
      </section>
    </article>
  );
}

export function ScenarioCards({ packId, scenarios }: { packId: string; scenarios: Scenario[] }) {
  if (scenarios.length === 0) return <p className="text-[13px] text-[#6E6B60]">This World pack ships no Scenarios.</p>;
  return (
    <div className="flex flex-col gap-4">
      {scenarios.map((s) => (
        <ScenarioCard key={s.id} packId={packId} scenario={s} />
      ))}
    </div>
  );
}
