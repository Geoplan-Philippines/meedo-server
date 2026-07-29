import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class GenerateHolidaysDTO {
  @ApiProperty({ example: 2026, description: 'Calendar year to import public holidays for' })
  @IsInt()
  @Min(1970)
  @Max(2100)
  year!: number;

  @ApiPropertyOptional({
    example: 'PH',
    default: 'PH',
    description: 'ISO 3166-1 alpha-2 country code',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;
}
