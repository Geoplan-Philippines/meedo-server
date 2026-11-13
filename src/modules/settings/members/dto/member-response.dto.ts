import { ApiProperty } from '@nestjs/swagger';

class MemberUserDTO {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) name!: string | null;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true, type: String }) image!: string | null;
}

/** A member row in `GET /settings/members`. */
export class MemberListRowDTO {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: ['member', 'admin', 'owner'] }) role!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: MemberUserDTO }) user!: MemberUserDTO;
}
