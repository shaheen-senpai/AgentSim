// The dark-theme page root shared by the marketing pages and the signed-in workspace: it loads the
// theme's typefaces (so every `--font-*` token in tokens.css resolves) and adds the skip link. The
// console keeps its own light shell.
import { marketingFontVariables } from "./fonts";

export function ThemeRoot({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${marketingFontVariables} min-h-screen bg-background font-body text-foreground antialiased selection:bg-primary/30`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to main content
      </a>
      {children}
    </div>
  );
}
