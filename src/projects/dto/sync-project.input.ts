import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class SyncProjectInput {
  @Field()
  repoUrl!: string;

  @Field(() => String, { nullable: true })
  branch?: string;
}
