import { ApiProperty } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'user123', required: false })
  username?: string;

  @ApiProperty({ example: 'strongPassword123', required: false })
  password?: string;
}
