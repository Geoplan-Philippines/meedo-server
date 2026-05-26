import { Prisma } from '@prisma/client';

export interface WorkOrders {
  id: string | number;
  workOrderNumber?: string;
  customerName?: string;
  statusName?: string;
  total?: string | number;
  reportedDate?: string;
}

export type ProjectInput = Prisma.ProjectCreateInput;

export type ApptivoResponse = {
  data?: {
    data?: WorkOrders[];
  } | WorkOrders[];
};
