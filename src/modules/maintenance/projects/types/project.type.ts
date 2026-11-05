export interface WorkOrder {
  id: string | number;
  workOrderNumber?: string;
  customerName?: string;
  customerId?: string | number;
  statusName?: string;
  total?: string | number;
  reportedDate?: string;
  /** Id of the record this work order was converted from (usually the sales quote). */
  fromObjectRefId?: string | number | null;
  customAttributes?: ApptivoCustomAttribute[];
}

/** Entry of a work order's customAttributes array; values are matched by customAttributeName. */
export interface ApptivoCustomAttribute {
  customAttributeName?: string;
  customAttributeValue?: unknown;
}

export interface Customer {
  customerId: string | number;
  customerName?: string;
}

export type ApptivoResponse<T = unknown> = {
  data?: T[];
  /** Total records Apptivo has for the query, across all pages. */
  countOfRecords?: number;
};

/** Per-entity outcome of an Apptivo sync. Existing Meedo state is never changed. */
export type SyncCounts = {
  /** Valid records received from Apptivo. */
  synced: number;
  created: number;
  /** Existing rows whose synced fields changed (independent of archive state). */
  updated: number;
  /** Newly marked absent from the upstream result. */
  missing: number;
  /** Compatibility counters; sync never archives or restores rows. */
  archived: number;
  unarchived: number;
};

export type ProjectSyncCounts = SyncCounts & {
  /** Work orders whose customer could not be matched to a client. */
  unmatched: number;
  clients: SyncCounts;
};
