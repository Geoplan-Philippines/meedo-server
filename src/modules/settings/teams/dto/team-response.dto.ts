import { ApiProperty } from '@nestjs/swagger';

/** A team row in `GET /settings/teams`. */
export class TeamListRowDTO {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty() memberCount!: number;
}
