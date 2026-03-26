import { IsString, IsEmail, MinLength } from 'class-validator';
import { Match } from 'src/common/decorators';
import * as usersSchema from '../schemas';

type User = typeof usersSchema.users.$inferInsert;

export class CreateUserDto implements Partial<User> {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @Match('password', { message: 'Passwords must match' })
  confirmPassword: string;
}
