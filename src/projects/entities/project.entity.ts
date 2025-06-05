import { ObjectType, Field, ID } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

@ObjectType()
export class Project {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  description!: string;

  @Field(() => [String])
  tags!: string[];

  @Field(() => String, { nullable: true })
  icon!: string | null;

  @Field(() => String, { nullable: true })
  image!: string | null;

  @Field(() => String, { nullable: true })
  demoUrl!: string | null;

  @Field(() => String, { nullable: true })
  repoUrl!: string | null;

  @Field(() => Boolean, { nullable: true })
  featured!: boolean | null;

  @Field(() => Boolean, { nullable: true })
  published!: boolean | null;

  @Field(() => Number, { nullable: true })
  order!: number | null;

  @Field(() => String, { nullable: true })
  category!: string | null;

  @Field(() => Boolean, { nullable: true })
  githubSync!: boolean | null;

  @Field(() => Boolean, { nullable: true })
  blacklisted!: boolean | null;

  @Field(() => String, { nullable: true })
  markdown!: string | null;

  @Field(() => Boolean)
  valid!: boolean;

  @Field(() => [String])
  validationErrors!: string[];

  @Field(() => [String])
  collaborators!: string[];

  @Field(() => Date, { nullable: true })
  firstCommitAt!: Date | null;

  @Field(() => Date, { nullable: true })
  lastCommitAt!: Date | null;

  @Field(() => GraphQLJSON, { nullable: true, description: 'GitHub metadata' })
  githubMetadata!: any;

  @Field(() => GraphQLJSON, {
    nullable: true,
    description: 'User-defined custom metadata parsed from Portfolio.md',
  })
  customMetadata!: any;

  @Field(() => Date, { nullable: true })
  syncedAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}
