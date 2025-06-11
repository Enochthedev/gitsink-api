import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty()
  token!: string;

  @ApiProperty({ example: 'newPassword123' })
  password!: string;
}
