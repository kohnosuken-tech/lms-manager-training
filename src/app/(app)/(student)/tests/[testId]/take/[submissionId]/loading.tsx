import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-48" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-6">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ))}
    </div>
  );
}
