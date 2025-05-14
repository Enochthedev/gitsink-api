import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class Project {
  @Field(() => ID)
  id: string;

  @Field()
  title: string;

  @Field()
  description: string;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field({ nullable: true })
  demoUrl?: string;

  @Field({ nullable: true })
  repoUrl?: string;

  @Field({ nullable: true })
  featured?: boolean;

  @Field({ nullable: true })
  published?: boolean;
}
