import { ApiProperty } from '@nestjs/swagger';

class WorkOrderClientDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerName!: string;
}

export class WorkOrderResponseDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workOrderNumber!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  total!: number;

  @ApiProperty({ nullable: true, type: String })
  reportedDate!: Date | null;

  @ApiProperty({ description: 'Set when the work order no longer appears in the Apptivo feed' })
  isArchived!: boolean;

  @ApiProperty({ nullable: true, type: String })
  archivedAt!: Date | null;

  @ApiProperty()
  apptivoId!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty({ type: WorkOrderClientDTO, nullable: true })
  client!: WorkOrderClientDTO | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
