"use client";
import { useEffect } from "react";
import { Icon } from "@/marketing/icons";

export type ToastMessage = { title: string; body?: string; tone?: "safe" | "danger" };

export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(id);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <div role="status" className="animate-toast-in fixed bottom-6 right-6 z-[60] flex max-w-sm items-start gap-3 rounded-panel border border-border bg-background p-4 shadow-[0_16px_48px_rgba(0,0,0,0.4)]">
      <Icon name={toast.tone === "danger" ? "alert" : "check"} className={`mt-0.5 size-5 shrink-0 ${toast.tone === "danger" ? "text-danger" : "text-primary"}`} />
      <div>
        <p className="text-body font-semibold">{toast.title}</p>
        {toast.body && <p className="mt-0.5 text-caption text-muted-foreground">{toast.body}</p>}
      </div>
    </div>
  );
}
