import { ObjectType, Field, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

@ObjectType()
export class SyncStatusUpdate {
  @Field(() => String)
  userId!: string;

  @Field(() => String, { nullable: true })
  projectId?: string;

  @Field(() => String)
  status!: 'started' | 'progress' | 'completed' | 'failed';

  @Field(() => String, { nullable: true })
  message?: string;

  @Field(() => Int, { nullable: true })
  progress?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: any;

  @Field(() => Date)
  timestamp!: Date;
}

@ObjectType()
export class ProfileViewEvent {
  @Field(() => String)
  profileId!: string;

  @Field(() => String)
  viewerId!: string;

  @Field(() => String, { nullable: true })
  viewerLocation?: string;

  @Field(() => String, { nullable: true })
  referrer?: string;

  @Field(() => Date)
  timestamp!: Date;
}

@ObjectType()
export class ServiceHealthStatus {
  @Field(() => String)
  name!: string;

  @Field(() => String)
  status!: 'up' | 'down' | 'degraded';

  @Field(() => Int)
  responseTime!: number;

  @Field(() => String, { nullable: true })
  error?: string;

  @Field(() => Date)
  lastCheck!: Date;

  @Field(() => GraphQLJSON, { nullable: true })
  details?: any;
}

@ObjectType()
export class SystemMetrics {
  @Field(() => Number)
  cpuUsage!: number;

  @Field(() => Number)
  memoryUsage!: number;

  @Field(() => Number)
  diskUsage!: number;

  @Field(() => Int)
  activeConnections!: number;

  @Field(() => Int)
  queueSize!: number;

  @Field(() => Number)
  averageResponseTime!: number;

  @Field(() => Number)
  errorRate!: number;

  @Field(() => Number)
  throughput!: number;
}

@ObjectType()
export class SystemHealthStatus {
  @Field(() => String)
  status!: 'healthy' | 'degraded' | 'unhealthy';

  @Field(() => [ServiceHealthStatus])
  services!: ServiceHealthStatus[];

  @Field(() => SystemMetrics)
  metrics!: SystemMetrics;

  @Field(() => Date)
  timestamp!: Date;

  @Field(() => Number)
  uptime!: number;

  @Field(() => String)
  version!: string;
}

@ObjectType()
export class EnrichmentStatusUpdate {
  @Field(() => String)
  jobId!: string;

  @Field(() => String)
  projectId!: string;

  @Field(() => String)
  status!: 'pending' | 'processing' | 'completed' | 'failed';

  @Field(() => Int, { nullable: true })
  progress?: number;

  @Field(() => String, { nullable: true })
  currentStep?: string;

  @Field(() => String, { nullable: true })
  error?: string;

  @Field(() => Date)
  timestamp!: Date;
}
