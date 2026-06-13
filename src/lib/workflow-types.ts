export const WORKFLOW_TYPES = {
  ENCARGO: "encargo",
  IMPRESION: "impresion",
} as const;

export type WorkflowType =
  (typeof WORKFLOW_TYPES)[keyof typeof WORKFLOW_TYPES];

export const WORKFLOW_TYPE_LABELS = {
  encargo: "Encargo",
  impresion: "Impresión",
} as const satisfies Record<WorkflowType, string>;
