import type { ReactNode } from "react";

import { MobileWorkspaceBar } from "./MobileWorkspaceBar";
import { WorkspaceActionRail } from "./WorkspaceActionRail";
import { WorkspaceTabletToolbar } from "./WorkspaceTabletToolbar";

type WorkspaceShellProps = {
  header: ReactNode;
  summary: ReactNode;
  main: ReactNode;
  className?: string;
};

export function WorkspaceShell({
  header,
  summary,
  main,
  className,
}: WorkspaceShellProps) {
  return (
    <section
      className={["min-w-0 space-y-5", className].filter(Boolean).join(" ")}
    >
      <div className="min-w-0">{header}</div>
      <div className="min-w-0">{summary}</div>
      <WorkspaceTabletToolbar />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0">{main}</div>
        <WorkspaceActionRail />
      </div>
      <MobileWorkspaceBar />
    </section>
  );
}
