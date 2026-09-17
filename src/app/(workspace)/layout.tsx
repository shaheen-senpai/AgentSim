// The signed-in workspace: `/agents` and everything under it. Dark theme from src/theme, the
// workspace top bar, and no marketing chrome.
import { ThemeRoot } from "@/theme/ThemeRoot";
import { AppNav } from "@/workspace/AppNav";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeRoot>
      <AppNav />
      {children}
    </ThemeRoot>
  );
}
