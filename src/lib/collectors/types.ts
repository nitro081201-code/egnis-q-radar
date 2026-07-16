export type ContentTable = "dispositions" | "recalls" | "regulations";

export interface CollectedRow {
  source_key: string;
  [column: string]: unknown;
}

export interface Collector {
  /** collection_runs.source_name 및 로그 식별자로 쓰인다 */
  sourceName: string;
  table: ContentTable;
  collect(): Promise<CollectedRow[]>;
}
