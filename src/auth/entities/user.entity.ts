import { ObjectType, Field, ID, HideField } from '@nestjs/graphql';

@ObjectType()
export class User {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  email!: string;

  @Field(() => String, { nullable: true })
  githubId!: string | null;

  @HideField()
  githubToken!: string | null;

  @Field(() => String, { nullable: true })
  accessToken!: string | null;

  @Field(() => String, { nullable: true })
  apiKey!: string | null;

  @Field(() => Date)
  createdAt!: Date;
}
