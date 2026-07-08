import {
  ArrowRight,
  ContactRound,
  CreditCard,
  Files,
  GitBranch,
  History,
  Info,
  ListChecks,
  MessageSquare,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { WorkspaceIconName } from "./types";

type WorkspaceIconProps = {
  name: WorkspaceIconName;
  className?: string;
};

const workspaceIcons: Record<WorkspaceIconName, LucideIcon> = {
  estado: GitBranch,
  tareas: ListChecks,
  archivos: Files,
  comentarios: MessageSquare,
  personal: UsersRound,
  pagos: CreditCard,
  historial: History,
  informacion: Info,
  cliente: ContactRound,
  convertir: ArrowRight,
};

export function WorkspaceIcon({ name, className }: WorkspaceIconProps) {
  const Icon = workspaceIcons[name];

  return (
    <Icon
      aria-hidden="true"
      className={className}
      strokeWidth={1.75}
    />
  );
}
