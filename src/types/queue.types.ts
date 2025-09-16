export type MailJobType =
  | 'waitlistWelcome'
  | 'signup'
  | 'forgotPassword'
  | 'signin'
  | 'passwordResetConfirmation'
  | 'magicLinkSignIn'
  | 'apiKeyRegeneration'
  | 'accountSuspension'
  | 'syncFailureNotification'
  | 'weeklyDigest';

export interface MailJob {
  type: MailJobType;
  email: string;
  token?: string;
  data?: Record<string, any>;
}
