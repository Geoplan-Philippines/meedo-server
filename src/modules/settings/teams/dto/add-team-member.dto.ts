import { IsNotEmpty, IsString } from 'class-validator';

export class AddTeamMemberDTO {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
