import * as React from "react"
import { cn } from "@/lib/utils"

type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl border bg-card py-16 text-center",
        className
      )}
      role="status"
    >
      {icon ? (
        <div className="text-muted-foreground/30" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-medium text-sm">{title}</p>
        {description ? (
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  )
}
