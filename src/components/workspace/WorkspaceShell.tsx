import type { ReactNode } from "react";

import { MobileWorkspaceBar } from "./MobileWorkspaceBar";
import { WorkspaceActionRail } from "./WorkspaceActionRail";
import { WorkspaceTabletToolbar } from "./WorkspaceTabletToolbar";

const MOBILE_WORKSPACE_BAR_CONTENT_OFFSET_CLASS =
  "pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0";

type WorkspaceShellProps = {
  header: ReactNode;
  summary: ReactNode;
  main: ReactNode;
  children?: ReactNode;
  className?: string;
  hasActions?: boolean;
};

export function WorkspaceShell({
  header,
  summary,
  main,
  children,
  className,
  hasActions = true,
}: WorkspaceShellProps) {
  return (
    <section
      className={[
        "min-w-0 space-y-5",
        hasActions ? MOBILE_WORKSPACE_BAR_CONTENT_OFFSET_CLASS : "",
        hasActions
          ? "[&_a]:scroll-mb-[calc(6rem+env(safe-area-inset-bottom))] [&_button]:scroll-mb-[calc(6rem+env(safe-area-inset-bottom))] [&_input]:scroll-mb-[calc(6rem+env(safe-area-inset-bottom))] [&_select]:scroll-mb-[calc(6rem+env(safe-area-inset-bottom))] [&_textarea]:scroll-mb-[calc(6rem+env(safe-area-inset-bottom))] md:[&_a]:scroll-mb-0 md:[&_button]:scroll-mb-0 md:[&_input]:scroll-mb-0 md:[&_select]:scroll-mb-0 md:[&_textarea]:scroll-mb-0"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
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
      {children ? <div className="min-w-0">{children}</div> : null}
      {hasActions ? <MobileWorkspaceBar /> : null}
    </section>
  );
}
