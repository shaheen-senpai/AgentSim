import { notFound } from "next/navigation";
import { loadRun } from "@/runner/store";
import { Header } from "@/ui/Header";
import { CompareColumn } from "@/ui/CompareColumn";

export const dynamic = "force-dynamic";

export default async function Compare({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const ra = a ? loadRun(a) : null, rb = b ? loadRun(b) : null;
  if (!ra || !rb) notFound();
  return (
    <div className="min-h-screen text-sm">
      <Header run={ra} />
      <div className="grid grid-cols-2 gap-4 p-4 h-[calc(100vh-48px)]"><CompareColumn run={ra} /><CompareColumn run={rb} /></div>
    </div>
  );
}
