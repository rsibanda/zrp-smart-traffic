import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsEmail,
  IsIn,
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
import { PageQuery } from './dto';
export class SearchQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) q?: string;
}
export class CreateUserDto {
  @ApiProperty() @IsString() @Length(3, 100) @Matches(/\S/) name!: string;
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
  @ApiProperty() @IsString() @Length(12, 200) password!: string;
  @ApiProperty({ enum: ['USER', 'OFFICER', 'SUPERVISOR', 'ADMIN'] })
  @IsIn(['USER', 'OFFICER', 'SUPERVISOR', 'ADMIN'])
  role!: 'USER' | 'OFFICER' | 'SUPERVISOR' | 'ADMIN';
  @ApiPropertyOptional() @IsOptional() @IsUUID() supervisorId?: string;
}
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
export class CategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  demeritPoints?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  paymentDueDays?: number;
  @ApiProperty() @Matches(/^[A-Z0-9-]{3,20}$/) code!: string;
  @ApiProperty() @IsString() @Length(3, 100) @Matches(/\S/) name!: string;
  @ApiProperty() @IsString() @Length(3, 1000) description!: string;
  @ApiProperty({ description: 'Configured fine amount' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  demoFineAmount!: number;
  @ApiProperty() @IsBoolean() active!: boolean;
}
export class SettingsDto {
  @ApiProperty()
  @IsString()
  @Length(3, 1000)
  @Matches(/\S/)
  publicNotice!: string;
}
export class IncidentDto {
  @ApiProperty() @IsUUID() requestKey!: string;
  @ApiProperty({ enum: ['ACCIDENT', 'HAZARD', 'CONGESTION', 'OTHER'] })
  @IsIn(['ACCIDENT', 'HAZARD', 'CONGESTION', 'OTHER'])
  type!: string;
  @ApiProperty()
  @IsString()
  @Length(3, 2000)
  @Matches(/\S/)
  description!: string;
  @ApiProperty() @IsString() @Length(3, 200) @Matches(/\S/) location!: string;
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
export class IncidentReviewDto {
  @ApiProperty({ enum: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'] })
  @IsIn(['IN_PROGRESS', 'RESOLVED', 'CANCELLED'])
  status!: 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
  @ApiProperty() @IsString() @Length(3, 1000) @Matches(/\S/) notes!: string;
}
export class CheckpointDto {
  @ApiProperty() @IsString() @Length(3, 100) @Matches(/\S/) name!: string;
  @ApiProperty() @IsString() @Length(3, 200) @Matches(/\S/) location!: string;
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @ApiProperty()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  startAt!: string;
  @ApiProperty()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  endAt!: string;
}
export class CheckpointReviewDto {
  @ApiProperty({ enum: ['ACTIVE', 'CLOSED'] })
  @IsIn(['ACTIVE', 'CLOSED'])
  status!: 'ACTIVE' | 'CLOSED';
}
