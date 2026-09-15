// The one sentence that points a Violation at the Attack that caused it — worded from the Run's own
// World pack, never from any one domain.
//
// It used to read "the injected block in the customer's email", which is true of `northwind` and of
// nothing else: on `halvard-helpdesk` the Attack appends a forged IT-SEC comment to an Issue, where
// there is no customer and no email. It was the last Northwind string in `src/`, and it rendered on
// the branch's headline feature (the Timeline *and* the flow view's Event drawer).
//
// The label comes from the Run's pack — `entityLabel(pack, run.attack.mutation.collection)`,
// resolved server-side and threaded down exactly as `DiffPanel`'s `principalLabel` is, because only
// the pack knows whether its untrusted rows are called Emails, Comments or something else.
//
// No React, no DOM: a string in, a string out. `tests/ui/injectionSource.test.ts` pins both the
// wording and the fallback; the domain-neutrality guard in `tests/ui/buildFlow.test.ts` pins that
// no Northwind entity name comes back into `src/ui` anywhere.

/** Used when the Run has no Attack collection to name, or its pack could not be loaded. */
const FALLBACK = "the injected block";

/**
 * "the injected block in the comment" — `entityLabel` is the pack's own label for the collection the
 * Attack's mutation targets ("Email", "Comment", …). Empty label → the bare phrase, which is still
 * true of every pack.
 */
export function injectionSourceLabel(entityLabel: string): string {
  const what = entityLabel.trim().toLowerCase();
  return what === "" ? FALLBACK : `${FALLBACK} in the ${what}`;
}
