import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsUUID } from 'class-validator';

export class CloseProjectDTO {
  @ApiProperty() @IsBoolean() isClosed!: boolean;
}
export class ArchiveProjectDTO {
  @ApiProperty() @IsBoolean() isArchived!: boolean;
}
export class AddProjectMemberDTO {
  @ApiProperty({ format: 'uuid' }) @IsUUID() userId!: string;
}
