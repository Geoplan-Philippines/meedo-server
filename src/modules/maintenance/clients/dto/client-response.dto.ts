import { ApiProperty } from '@nestjs/swagger';

class ClientCountDTO {
  @ApiProperty({ example: 3, description: 'Number of projects linked to this client' })
  projects!: number;
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