import { IsString, IsEmail, MinLength } from 'class-validator';
import { Match } from 'src/common/decorators';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @ApiProperty({ example: 'password123' })
  @Match('password', { message: 'Passwords must match' })
  confirmPassword: string;
}
