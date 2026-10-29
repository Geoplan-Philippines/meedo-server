import { ApiProperty } from '@nestjs/swagger';

class ClientCountDTO {
  @ApiProperty({ example: 3, description: 'Number of projects linked to this client' })
  projects!: number;
}

export class ClientResponseDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true, type: String })
  apptivoId!: string | null;

  @ApiProperty()
  customerName!: string;

  @ApiProperty({ nullable: true, type: String, description: 'Admin-set name; never written by the Apptivo sync' })
  displayName!: string | null;

  @ApiProperty({ description: 'Shown name: displayName, else customerName' })
  name!: string;

  @ApiProperty({ description: 'All linked projects, archived included' })
  projectCount!: number;

  @ApiProperty({ description: 'Linked projects that are not archived' })
  activeProjectCount!: number;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  isArchived!: boolean;

  @ApiProperty({ nullable: true, type: Date })
  archivedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: ClientCountDTO })
  _count!: ClientCountDTO;
}

export class ClientOptionDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Shown name: displayName, else customerName' })
  name!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  isArchived!: boolean;
}

export class ClientTreeNodeDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Shown name: displayName, else customerName' })
  name!: string;

  @ApiProperty({ description: 'Active projects matching the tree filters' })
  projectCount!: number;
}
