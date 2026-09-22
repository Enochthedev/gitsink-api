import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { AuditAction, AuditResource } from '../interfaces/audit.interface';

// Register enums for GraphQL
registerEnumType(AuditAction, {
  name: 'AuditAction',
  description: 'Types of actions that can be audited',
});

registerEnumType(AuditResource, {
  name: 'AuditResource',
  description: 'Types of resources that can be audited',
});

@ObjectType()
export class AuditLogEntity {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  userId?: string;

  @Field(() => AuditAction)
  action!: AuditAction;

  @Field(() => AuditResource, { nullable: true })
  resource?: AuditResource;

  @Field({ nullable: true })
  resourceId?: string;

  @Field(() => String, { nullable: true })
  details?: string; // JSON string representation

  @Field({ nullable: true })
  ipAddress?: string;

  @Field({ nullable: true })
  userAgent?: string;

  @Field()
  success!: boolean;

  @Field({ nullable: true })
  error?: string;

  @Field()
  timestamp!: Date;

  // Virtual field for parsed details
  @Field(() => String, { nullable: true })
  get detailsJson(): string | null {
    return this.details || null;
  }

  // Virtual field for user name (would need to be resolved from user service)
  @Field(() => String, { nullable: true })
  get userName(): string | null {
    // This would typically be resolved via a field resolver
    return null;
  }
}

@ObjectType()
export class AuditLogConnection {
  @Field(() => [AuditLogEntity])
  nodes!: AuditLogEntity[];

  @Field()
  totalCount!: number;

  @Field()
  hasNextPage!: boolean;

  @Field()
  hasPreviousPage!: boolean;
}

@ObjectType()
export class AuditSummaryEntity {
  @Field()
  totalLogs!: number;

  @Field()
  successfulActions!: number;

  @Field()
  failedActions!: number;

  @Field()
  uniqueUsers!: number;

  @Field()
  mostCommonAction!: string;

  @Field()
  timeRange!: string;

  @Field()
  totalEvents!: number;

  @Field()
  successfulEvents!: number;
}
