import { Sidebar } from "./Sidebar";

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[240px_1fr] min-h-screen bg-[#F7F5EF]">
      <Sidebar />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
