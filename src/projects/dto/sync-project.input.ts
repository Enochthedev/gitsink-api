import { InputType, Field } from '@nestjs/graphql';
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

@InputType()
export class SyncProjectInput {
  @ApiProperty({ example: 'https://github.com/user/repo' })
  @Field()
  @IsString()
  repoUrl!: string;

  @ApiProperty({ example: 'main', required: false })
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  branch?: string;
}
