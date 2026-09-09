import { ApiProperty } from '@nestjs/swagger';

class ClientCountDTO {
  @ApiProperty({ example: 3, description: 'Number of work orders linked to this client' })
  workOrders!: number;
}

export class ClientResponseDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  apptivoId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: ClientCountDTO })
  _count!: ClientCountDTO;
}