import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="aspect-video w-full rounded-xl" />
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-32 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  );
}
