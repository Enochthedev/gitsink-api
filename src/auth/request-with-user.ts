import { Request } from 'express';
import { User } from '@prisma/client';
import { EnhancedJwtPayload } from './jwt-token.service';

export interface RequestWithUser extends Request {
  user: User;
  userId?: string;
  isSandboxMode?: boolean;
  apiKeyUsage?: {
    usageCount: number;
    startTime: number;
  };
  tokenPayload?: EnhancedJwtPayload;
  session?: {
    userId?: string;
    [key: string]: any;
  };
}
