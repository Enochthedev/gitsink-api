export type MailJobType =
  | 'waitlistWelcome'
  | 'signup'
  | 'forgotPassword'
  | 'signin'
  | 'passwordResetConfirmation'
  | 'magicLinkSignIn';

export interface MailJob {
  type: MailJobType;
  email: string;
  token?: string;
}
