import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { TICKET_COMMENT_MAX_LENGTH } from '../constants/ticket.constants';

export class CreateTicketCommentDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TICKET_COMMENT_MAX_LENGTH)
  body!: string;
}
