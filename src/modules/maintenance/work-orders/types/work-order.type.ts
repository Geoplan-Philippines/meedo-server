import { Prisma } from '@prisma/client';

/**
 * Shape returned by the Apptivo work-order API. Distinct from our `WorkOrder`
 * model, which is the normalized row we persist.
 */
export interface ApptivoWorkOrder {
  id: string | number;
  workOrderNumber?: string;
  customerName?: string;
  customerId?: string | number;
  statusName?: string;
  total?: string | number;
  reportedDate?: string;
}

export interface Customer {
  customerId: string | number;
  customerName?: string;
}

export type WorkOrderInput = Omit<
  Prisma.WorkOrderCreateInput,
  'organization' | 'tickets' | 'projects' | 'client' | 'slaPolicies' | 'timesheetEntries'
>;

export type ClientInput = Omit<Prisma.ClientCreateInput, 'organization' | 'workOrders'>;

export type ApptivoResponse<T = unknown> = {
  data?: T[];
};
