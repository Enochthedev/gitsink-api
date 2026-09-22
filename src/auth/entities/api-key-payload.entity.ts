import { Field, ObjectType } from '@nestjs/graphql';
import { User } from './user.entity';

@ObjectType()
export class ApiKeyPayload {
  @Field(() => String)
  apiKey!: string;

  @Field(() => User)
  user!: User;
}
