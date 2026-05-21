import { IsUUID } from 'class-validator';

export class CreateTeamQueryDTO {
  @IsUUID()
  organizationId!: string;
}