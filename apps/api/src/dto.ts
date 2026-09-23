import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
  @ApiProperty() @IsString() @Length(1, 200) password!: string;
}
export class VehicleQuery {
  @ApiProperty({ example: 'DEMO001' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/[\s-]/g, '').toUpperCase()
      : value,
  )
  @Matches(/^[A-Z0-9]{3,16}$/)
  registration!: string;
}
export class PageQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
export class OffenceQuery extends PageQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CONFIRMED', 'CANCELLED'])
  status?: 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'CONFIRMED' | 'CANCELLED';
}
export class CreateOffenceDto {
  @ApiProperty({
    description: 'Client UUID reused for every retry of this draft',
  })
  @IsUUID()
  requestKey!: string;
  @ApiProperty() @IsUUID() vehicleId!: string;
  @ApiProperty() @IsUUID() categoryId!: string;
  @ApiProperty() @IsString() @Length(3, 200) @Matches(/\S/) location!: string;
  @ApiProperty() @IsString() @Length(3, 2000) @Matches(/\S/) notes!: string;
  @ApiProperty({ example: '2026-09-21T12:00:00Z' })
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  observedAt!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
export class ReviewDto {
  @ApiProperty({ enum: ['UNDER_REVIEW', 'CONFIRMED', 'CANCELLED'] })
  @IsIn(['UNDER_REVIEW', 'CONFIRMED', 'CANCELLED'])
  status!: 'UNDER_REVIEW' | 'CONFIRMED' | 'CANCELLED';
  @ApiProperty() @IsString() @Length(3, 1000) @Matches(/\S/) notes!: string;
}
