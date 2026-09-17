// The mock's `.shell` grid: a collapsible sidebar and one `<main>`. Every page renders inside it.
import { Sidebar } from "./Sidebar";

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell" id="shell">
      <Sidebar />
      <main>{children}</main>
    </div>
  );
}
