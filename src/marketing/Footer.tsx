import { FOOTER } from "./content";

export function Footer() {
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-page flex-col justify-between gap-4 px-gutter font-label text-label uppercase text-muted-foreground sm:flex-row lg:px-gutter-lg">
        <span>{FOOTER.left}</span>
        <span>{FOOTER.right}</span>
      </div>
    </footer>
  );
}
