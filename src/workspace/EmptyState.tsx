import type { ReactNode } from "react";
import { Icon, type IconName } from "@/marketing/icons";

export function EmptyState({ icon, title, body, children }: { icon: IconName; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="animate-fade-in flex flex-col items-center rounded-panel border border-dashed border-border px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary">
        <Icon name={icon} className="size-5" />
      </span>
      <h3 className="mt-5 font-heading text-h3 font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-body text-muted-foreground">{body}</p>
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}
