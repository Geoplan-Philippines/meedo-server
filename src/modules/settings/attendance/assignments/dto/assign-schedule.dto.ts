import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignScheduleDTO {
  @ApiProperty({ description: 'Weekly schedule to assign to the team or employee' })
  @IsUUID()
  weeklyScheduleId!: string;
}
