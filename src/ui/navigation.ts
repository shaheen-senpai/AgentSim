// Shared "is this nav item the current section?" rule for the console's Sidebar and Header, so the
// two never disagree. `/runs` owns every run page (`/runs`, `/runs/new`, `/runs/<id>`); every other
// section owns its exact path and anything nested under it. The marketing home page at `/` belongs
// to no console section.
export function isCurrentSection(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
