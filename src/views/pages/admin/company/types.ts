// src/components/reusable-table/types.ts
export type ColumnConfig = {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "textarea";
  filterable?: boolean;
};
