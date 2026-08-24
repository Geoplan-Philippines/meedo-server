import { ApiProperty } from '@nestjs/swagger';

class ProjectClientDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerName!: string;
}

export class ProjectResponseDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workOrderNumber!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  total!: number;

  @ApiProperty({ nullable: true, type: String })
  reportedDate!: Date | null;

  @ApiProperty()
  apptivoId!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty({ type: ProjectClientDTO, nullable: true })
  client!: ProjectClientDTO | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}