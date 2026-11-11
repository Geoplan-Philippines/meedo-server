import { ApiProperty } from '@nestjs/swagger';

export class SyncCountsDTO {
  @ApiProperty({ description: 'Valid records received from Apptivo' })
  synced!: number;

  @ApiProperty()
  created!: number;

  @ApiProperty({ description: 'Existing rows whose synced fields changed' })
  updated!: number;

  @ApiProperty({ description: 'Rows newly marked missing from Apptivo; no archive state is changed' })
  missing!: number;

  @ApiProperty({ description: 'Compatibility counter, always zero: sync never archives' })
  archived!: number;

  @ApiProperty({ description: 'Compatibility counter, always zero: sync never restores' })
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
