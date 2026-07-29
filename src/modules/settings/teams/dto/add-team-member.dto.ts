import { IsUUID } from 'class-validator';

export class AddTeamMemberDTO {
  @IsUUID()
  userId!: string;
}
