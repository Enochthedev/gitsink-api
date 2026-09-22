import { Field, InputType } from '@nestjs/graphql';
import { ApiProperty } from '@nestjs/swagger';

@InputType()
export class ProjectFilterInput {
  @ApiProperty({ required: false, example: 'demo' })
  @Field(() => String, { nullable: true })
  tag?: string;

  @ApiProperty({ required: false, example: 'library' })
  @Field(() => String, { nullable: true })
  category?: string;

  @ApiProperty({ required: false })
  @Field(() => Boolean, { nullable: true })
  featured?: boolean;
}
