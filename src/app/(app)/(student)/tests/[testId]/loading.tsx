import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-10 w-40 rounded-md" />
    </div>
  );
}
