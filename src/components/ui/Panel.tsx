import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  children: ReactNode;
  corners?: boolean;
}

/** 通用玻璃面板容器 */
export function Panel({
  title,
  icon,
  action,
  className,
  bodyClassName,
  headerClassName,
  children,
  corners = true,
}: PanelProps) {
  return (
    <div className={cn("glass-panel glass-panel-hover flex flex-col", corners && "cyber-corners", className)}>
      {title && (
        <div className={cn("panel-header", headerClassName)}>
          <div className="flex items-center gap-2">
            {icon && <span className="text-neon-cyan">{icon}</span>}
            <h3 className="panel-title">{title}</h3>
          </div>
          {action}
        </div>
      )}
      <div className={cn("flex-1 min-h-0", bodyClassName)}>{children}</div>
    </div>
  );
}
