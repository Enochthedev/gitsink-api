import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';

@Resolver(() => User)
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  /**
   * Create a user account and return the new user record.
   */
  @Mutation(() => User)
  signup(@Args('email') email: string): Promise<User> {
    return this.authService.signup(email);
  }

  /**
   * Link a GitHub account to the user.
   */
  @Mutation(() => User)
  connectGitHub(
    @Args('userId') userId: string,
    @Args('githubId') githubId: string,
  ): Promise<User> {
    return this.authService.connectGitHub(userId, githubId);
  }

  /**
   * Regenerate the user's API key.
   */
  @Mutation(() => User)
  regenerateApiKey(@Args('userId') userId: string): Promise<User> {
    return this.authService.regenerateApiKey(userId);
  }

  @Mutation(() => User)
  githubOAuth(
    @Args('userId') userId: string,
    @Args('code') code: string,
  ): Promise<User> {
    return this.authService.oauth(userId, code);
  }
}
