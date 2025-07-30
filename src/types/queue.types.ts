export type MailJobType =
  | 'waitlistWelcome'
  | 'signup'
  | 'forgotPassword'
  | 'signin'
  | 'passwordResetConfirmation';

export interface MailJob {
  type: MailJobType;
  email: string;
  token?: string;
}
