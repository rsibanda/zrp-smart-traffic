import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  Equals,
} from 'class-validator';
import { VehicleQuery } from './dto';

export class ApplicationDto extends VehicleQuery {
  @ApiProperty() @IsUUID() requestKey!: string;
  @ApiProperty() @IsUUID() categoryId!: string;
  @ApiProperty() @IsInt() @Min(0) revision!: number;
  @ApiProperty() @IsString() @Length(1, 80) make!: string;
  @ApiProperty() @IsString() @Length(1, 80) model!: string;
  @ApiProperty()
  @IsInt()
  @Min(1886)
  @Max(new Date().getFullYear() + 1)
  year!: number;
  @ApiProperty() @IsString() @Length(1, 40) colour!: string;
  @ApiProperty({
    description:
      'VIN/chassis; historic and special vehicles may have non-standard identifiers.',
  })
  @Matches(/^[A-Za-z0-9 -]{3,40}$/)
  chassis!: string;
  @ApiProperty() @IsString() @Length(0, 60) engine!: string;
  @ApiProperty()
  @IsIn(['OWNER', 'AUTHORISED_DRIVER', 'COMPANY_REPRESENTATIVE'])
  relationship!: string;
  @ApiProperty() @IsBoolean() declaration!: boolean;
}
export class ApplicationSubmitDto {
  @ApiProperty() @IsInt() @Min(0) revision!: number;
  @ApiProperty() @Equals(true) declaration!: boolean;
}
export class ApplicationReviewDto {
  @ApiProperty() @IsInt() @Min(0) revision!: number;
  @ApiProperty() @IsIn(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']) status!:
    'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  @ApiProperty() @IsString() @Length(3, 1000) reason!: string;
  @ApiProperty() @Equals(true) checked!: boolean;
}
export class VehicleCategoryDto {
  @ApiProperty() @Matches(/^[A-Z0-9_]{2,20}$/) code!: string;
  @ApiProperty() @IsString() @Length(3, 100) label!: string;
  @ApiProperty() @IsInt() @Min(0) @Max(10000000) feeMinor!: number;
  @ApiProperty() @IsBoolean() active!: boolean;
}
export class ApplicationFeeDto {
  @ApiProperty() @IsUUID() requestKey!: string;
  @ApiProperty() @IsIn(['ECOCASH', 'INNBUCKS', 'CARD']) method!:
    'ECOCASH' | 'INNBUCKS' | 'CARD';
}
