import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class ProjectFilterInput {
  @Field(() => String, { nullable: true })
  tag?: string;

  @Field(() => String, { nullable: true })
  category?: string;

  @Field(() => Boolean, { nullable: true })
  featured?: boolean;
}
