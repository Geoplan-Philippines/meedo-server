import { ApiProperty } from '@nestjs/swagger';

export class SyncCountsDTO {
  @ApiProperty({ description: 'Valid records received from Apptivo' })
  synced!: number;

  @ApiProperty()
  created!: number;

  @ApiProperty({ description: 'Existing rows whose synced fields changed' })
  updated!: number;

  @ApiProperty({ description: 'Rows archived because Apptivo no longer returns them' })
  archived!: number;

  @ApiProperty({ description: 'Archived rows that reappeared in Apptivo' })
  unarchived!: number;
}

export class ClientSyncResultDTO extends SyncCountsDTO {
  @ApiProperty()
  message!: string;
}

export class ProjectSyncResultDTO extends SyncCountsDTO {
  @ApiProperty()
  message!: string;

  @ApiProperty({ description: 'Work orders whose customer matched no client' })
  unmatched!: number;

  @ApiProperty({ type: SyncCountsDTO })
  clients!: SyncCountsDTO;
}
