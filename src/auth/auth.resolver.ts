import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { ApiKeyPayload } from './entities/api-key-payload.entity';

@Resolver(() => User)
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  /**
   * Create a user account and return the new user record.
   */
  @Mutation(() => ApiKeyPayload)
  signup(@Args('email') email: string): Promise<ApiKeyPayload> {
    return this.authService.signup(email);
  }

  /**
   * Link a GitHub account to the user.
   */
  @Mutation(() => User)
  connectGitHub(
    @Args('userId') userId: string,
    @Args('githubId') githubId: string,
    @Args('githubToken') githubToken: string,
  ): Promise<User> {
    return this.authService.connectGitHub(userId, githubId, githubToken);
  }

  /**
   * Regenerate the user's API key.
   */
  @Mutation(() => ApiKeyPayload)
  regenerateApiKey(@Args('userId') userId: string): Promise<ApiKeyPayload> {
    return this.authService.regenerateApiKey(userId);
  }

  @Mutation(() => User)
  githubOAuth(
    @Args('userId') userId: string,
    @Args('code') code: string,
  ): Promise<User> {
    return this.authService.oauth(userId, code);
  }

  @Mutation(() => User)
  revokeApiKey(@Args('userId') userId: string): Promise<User> {
    return this.authService.revokeApiKey(userId);
  }
}
