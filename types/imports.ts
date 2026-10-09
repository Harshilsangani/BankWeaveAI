export type ImportEntity = "customers" | "accounts" | "transactions" | "loans";
export interface ImportField {
  key: string;
  label: string;
  required: boolean;
  hint: string;
}
export interface ImportSchema {
  entities: Partial<Record<ImportEntity, ImportField[]>>;
  periods: string[];
  regions: string[];
  branches: { id: string; name: string }[];
  currency: string;
}
export interface ImportUpload {
  id: string;
  filename: string;
  format: string;
  datasetId: string;
  sheets: { name: string; headers: string[]; rows: number; sample: Record<string, string>[] }[];
}
export interface FileImportPreview {
  id: string;
  sourceHash: string;
  datasetId: string;
  entity: ImportEntity;
  currency: string;
  rows: number;
  validRows: number;
  canImport: boolean;
  errors: { row: number; reasons: string[] }[];
  sample: Record<string, string>[];
}
export interface ImportHistory {
  id: string;
  filename: string;
  format: string;
  entity: ImportEntity;
  sheet: string;
  status: string;
  createdAt: string;
  rows: number;
  errorRows: number;
  importedRows: number;
}
