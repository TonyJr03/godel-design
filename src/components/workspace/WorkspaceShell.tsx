import type { ReactNode } from "react";

import { MobileWorkspaceBar } from "./MobileWorkspaceBar";
import { WorkspaceActionRail } from "./WorkspaceActionRail";
import { WorkspaceTabletToolbar } from "./WorkspaceTabletToolbar";

type WorkspaceShellProps = {
  header: ReactNode;
  summary: ReactNode;
  main: ReactNode;
  className?: string;
  hasActions?: boolean;
};

export function WorkspaceShell({
  header,
  summary,
  main,
  className,
  hasActions = true,
}: WorkspaceShellProps) {
  return (
    <section
      className={["min-w-0 space-y-5", className].filter(Boolean).join(" ")}
    >
      <div className="min-w-0">{header}</div>
      <div className="min-w-0">{summary}</div>
      {hasActions ? <WorkspaceTabletToolbar /> : null}
      <div
        className={[
          "grid min-w-0 gap-6",
          hasActions ? "xl:grid-cols-[minmax(0,1fr)_14rem]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="min-w-0">{main}</div>
        {hasActions ? <WorkspaceActionRail /> : null}
      </div>
      {hasActions ? <MobileWorkspaceBar /> : null}
    </section>
  );
}
