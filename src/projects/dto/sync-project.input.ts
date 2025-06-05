import { InputType, Field } from '@nestjs/graphql';
import { IsString, IsOptional } from 'class-validator';

@InputType()
export class SyncProjectInput {
  @Field()
  @IsString()
  repoUrl!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  branch?: string;
}
