import { PartialType } from '@nestjs/mapped-types';

import { CreateTicketCommentDTO } from './create-ticket-comment.dto';

export class UpdateTicketCommentDTO extends PartialType(CreateTicketCommentDTO) {}
