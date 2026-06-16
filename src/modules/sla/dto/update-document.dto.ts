import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateDocumentDTO {
  @ApiProperty({ example: 'https://example.com/sla-document.pdf', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  @MaxLength(500)
  documentUrl!: string;
}
