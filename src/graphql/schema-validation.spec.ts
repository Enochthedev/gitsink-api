import { Test, TestingModule } from '@nestjs/testing';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { buildSchema, GraphQLSchema, isObjectType, isEnumType, isScalarType } from 'graphql';
import * as fs from 'fs';
import * as path from 'path';

describe('GraphQL Schema Validation', () => {
  let schema: GraphQLSchema;

  beforeAll(async () => {
    // Read the generated schema file
    const schemaPath = path.join(__dirname, '../schema.gql');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    schema = buildSchema(schemaContent);
  });

  describe('Subscription Types', () => {
    it('should have Subscription type defined', () => {
      const subscriptionType = schema.getSubscriptionType();
      expect(subscriptionType).toBeDefined();
      expect(subscriptionType?.name).toBe('Subscription');
    });

    it('should have all required subscription fields', () => {
      const subscriptionType = schema.getSubscriptionType();
      const fields = subscriptionType?.getFields();

      expect(fields).toHaveProperty('syncStatusUpdates');
      expect(fields).toHaveProperty('enrichmentStatus');
      expect(fields).toHaveProperty('userEnrichmentUpdates');
      expect(fields).toHaveProperty('profileViews');
      expect(fields).toHaveProperty('systemHealthUpdates');
    });

    it('should have correct return types for subscription fields', () => {
      const subscriptionType = schema.getSubscriptionType();
      const fields = subscriptionType?.getFields();

      // Check syncStatusUpdates
      expect(fields?.syncStatusUpdates.type.toString()).toBe('SyncStatusUpdate!');

      // Check enrichmentStatus
      expect(fields?.enrichmentStatus.type.toString()).toBe('EnrichmentStatusUpdate!');

      // Check userEnrichmentUpdates
      expect(fields?.userEnrichmentUpdates.type.toString()).toBe('EnrichmentStatusUpdate!');

      // Check profileViews
      expect(fields?.profileViews.type.toString()).toBe('ProfileViewEvent!');

      // Check systemHealthUpdates
      expect(fields?.systemHealthUpdates.type.toString()).toBe('SystemHealthStatus!');
    });

    it('should have correct arguments for subscription fields', () => {
      const subscriptionType = schema.getSubscriptionType();
      const fields = subscriptionType?.getFields();

      // Check enrichmentStatus arguments
      const enrichmentStatusArgs = fields?.enrichmentStatus.args;
      expect(enrichmentStatusArgs).toHaveLength(1);
      expect(enrichmentStatusArgs?.[0].name).toBe('projectId');
      expect(enrichmentStatusArgs?.[0].type.toString()).toBe('String!');

      // Check profileViews arguments
      const profileViewsArgs = fields?.profileViews.args;
      expect(profileViewsArgs).toHaveLength(1);
      expect(profileViewsArgs?.[0].name).toBe('profileId');
      expect(profileViewsArgs?.[0].type.toString()).toBe('String!');
    });
  });

  describe('Subscription Data Types', () => {
    it('should have SyncStatusUpdate type with correct fields', () => {
      const syncStatusUpdateType = schema.getType('SyncStatusUpdate');
      expect(syncStatusUpdateType).toBeDefined();
      expect(isObjectType(syncStatusUpdateType)).toBe(true);

      if (isObjectType(syncStatusUpdateType)) {
        const fields = syncStatusUpdateType.getFields();

        expect(fields).toHaveProperty('userId');
        expect(fields).toHaveProperty('projectId');
        expect(fields).toHaveProperty('status');
        expect(fields).toHaveProperty('message');
        expect(fields).toHaveProperty('progress');
        expect(fields).toHaveProperty('metadata');
        expect(fields).toHaveProperty('timestamp');

        // Check field types
        expect(fields.userId.type.toString()).toBe('String!');
        expect(fields.projectId?.type.toString()).toBe('String');
        expect(fields.status.type.toString()).toBe('String!');
        expect(fields.message?.type.toString()).toBe('String');
        expect(fields.progress?.type.toString()).toBe('Int');
        expect(fields.metadata?.type.toString()).toBe('JSON');
        expect(fields.timestamp.type.toString()).toBe('DateTime!');
      }
    });

    it('should have EnrichmentStatusUpdate type with correct fields', () => {
      const enrichmentStatusUpdateType = schema.getType('EnrichmentStatusUpdate');
      expect(enrichmentStatusUpdateType).toBeDefined();
      expect(isObjectType(enrichmentStatusUpdateType)).toBe(true);

      if (isObjectType(enrichmentStatusUpdateType)) {
        const fields = enrichmentStatusUpdateType.getFields();

        expect(fields).toHaveProperty('jobId');
        expect(fields).toHaveProperty('projectId');
        expect(fields).toHaveProperty('status');
        expect(fields).toHaveProperty('progress');
        expect(fields).toHaveProperty('currentStep');
        expect(fields).toHaveProperty('error');
        expect(fields).toHaveProperty('timestamp');

        // Check field types
        expect(fields.jobId.type.toString()).toBe('String!');
        expect(fields.projectId.type.toString()).toBe('String!');
        expect(fields.status.type.toString()).toBe('String!');
        expect(fields.progress?.type.toString()).toBe('Int');
        expect(fields.currentStep?.type.toString()).toBe('String');
        expect(fields.error?.type.toString()).toBe('String');
        expect(fields.timestamp.type.toString()).toBe('DateTime!');
      }
    });

    it('should have ProfileViewEvent type with correct fields', () => {
      const profileViewEventType = schema.getType('ProfileViewEvent');
      expect(profileViewEventType).toBeDefined();
      expect(isObjectType(profileViewEventType)).toBe(true);

      if (isObjectType(profileViewEventType)) {
        const fields = profileViewEventType.getFields();

        expect(fields).toHaveProperty('profileId');
        expect(fields).toHaveProperty('viewerId');
        expect(fields).toHaveProperty('viewerLocation');
        expect(fields).toHaveProperty('referrer');
        expect(fields).toHaveProperty('timestamp');

        // Check field types
        expect(fields.profileId.type.toString()).toBe('String!');
        expect(fields.viewerId.type.toString()).toBe('String!');
        expect(fields.viewerLocation?.type.toString()).toBe('String');
        expect(fields.referrer?.type.toString()).toBe('String');
        expect(fields.timestamp.type.toString()).toBe('DateTime!');
      }
    });

    it('should have SystemHealthStatus type with correct fields', () => {
      const systemHealthStatusType = schema.getType('SystemHealthStatus');
      expect(systemHealthStatusType).toBeDefined();
      expect(isObjectType(systemHealthStatusType)).toBe(true);

      if (isObjectType(systemHealthStatusType)) {
        const fields = systemHealthStatusType.getFields();

        expect(fields).toHaveProperty('status');
        expect(fields).toHaveProperty('services');
        expect(fields).toHaveProperty('metrics');
        expect(fields).toHaveProperty('timestamp');

        // Check field types
        expect(fields.status.type.toString()).toBe('String!');
        expect(fields.services.type.toString()).toBe('[ServiceHealth!]!');
        expect(fields.metrics.type.toString()).toBe('SystemMetrics!');
        expect(fields.timestamp.type.toString()).toBe('DateTime!');
      }
    });

    it('should have ServiceHealth type with correct fields', () => {
      const serviceHealthType = schema.getType('ServiceHealth');
      expect(serviceHealthType).toBeDefined();
      expect(isObjectType(serviceHealthType)).toBe(true);

      if (isObjectType(serviceHealthType)) {
        const fields = serviceHealthType.getFields();

        expect(fields).toHaveProperty('name');
        expect(fields).toHaveProperty('status');
        expect(fields).toHaveProperty('responseTime');
        expect(fields).toHaveProperty('error');
        expect(fields).toHaveProperty('lastCheck');

        // Check field types
        expect(fields.name.type.toString()).toBe('String!');
        expect(fields.status.type.toString()).toBe('String!');
        expect(fields.responseTime?.type.toString()).toBe('Int');
        expect(fields.error?.type.toString()).toBe('String');
        expect(fields.lastCheck.type.toString()).toBe('DateTime!');
      }
    });

    it('should have SystemMetrics type with correct fields', () => {
      const systemMetricsType = schema.getType('SystemMetrics');
      expect(systemMetricsType).toBeDefined();
      expect(isObjectType(systemMetricsType)).toBe(true);

      if (isObjectType(systemMetricsType)) {
        const fields = systemMetricsType.getFields();

        expect(fields).toHaveProperty('cpuUsage');
        expect(fields).toHaveProperty('memoryUsage');
        expect(fields).toHaveProperty('diskUsage');
        expect(fields).toHaveProperty('activeConnections');
        expect(fields).toHaveProperty('queueSize');
        expect(fields).toHaveProperty('averageResponseTime');

        // Check field types
        expect(fields.cpuUsage.type.toString()).toBe('Float!');
        expect(fields.memoryUsage.type.toString()).toBe('Float!');
        expect(fields.diskUsage.type.toString()).toBe('Float!');
        expect(fields.activeConnections.type.toString()).toBe('Int!');
        expect(fields.queueSize.type.toString()).toBe('Int!');
        expect(fields.averageResponseTime.type.toString()).toBe('Float!');
      }
    });
  });

  describe('Enhanced Query Types', () => {
    it('should have ProjectConnection type for pagination', () => {
      const projectConnectionType = schema.getType('ProjectConnection');
      expect(projectConnectionType).toBeDefined();
      expect(isObjectType(projectConnectionType)).toBe(true);

      if (isObjectType(projectConnectionType)) {
        const fields = projectConnectionType.getFields();

        expect(fields).toHaveProperty('edges');
        expect(fields).toHaveProperty('pageInfo');
        expect(fields).toHaveProperty('totalCount');

        expect(fields.edges.type.toString()).toBe('[ProjectEdge!]!');
        expect(fields.pageInfo.type.toString()).toBe('PageInfo!');
        expect(fields.totalCount.type.toString()).toBe('Int!');
      }
    });

    it('should have ProjectAggregation type for statistics', () => {
      const projectAggregationType = schema.getType('ProjectAggregation');
      expect(projectAggregationType).toBeDefined();
      expect(isObjectType(projectAggregationType)).toBe(true);

      if (isObjectType(projectAggregationType)) {
        const fields = projectAggregationType.getFields();

        expect(fields).toHaveProperty('totalProjects');
        expect(fields).toHaveProperty('publicProjects');
        expect(fields).toHaveProperty('privateProjects');
        expect(fields).toHaveProperty('featuredProjects');
        expect(fields).toHaveProperty('totalStars');
        expect(fields).toHaveProperty('totalForks');
        expect(fields).toHaveProperty('languageStats');
        expect(fields).toHaveProperty('categoryStats');
        expect(fields).toHaveProperty('platformStats');
      }
    });

    it('should have enhanced filter input types', () => {
      const enhancedProjectFilterInputType = schema.getType('EnhancedProjectFilterInput');
      expect(enhancedProjectFilterInputType).toBeDefined();

      const projectSortInputType = schema.getType('ProjectSortInput');
      expect(projectSortInputType).toBeDefined();

      const paginationInputType = schema.getType('PaginationInput');
      expect(paginationInputType).toBeDefined();
    });
  });

  describe('Query Type Enhancements', () => {
    it('should have enhanced query fields', () => {
      const queryType = schema.getQueryType();
      const fields = queryType?.getFields();

      expect(fields).toHaveProperty('enhancedProjects');
      expect(fields).toHaveProperty('searchProjects');
      expect(fields).toHaveProperty('projectStatistics');
      expect(fields).toHaveProperty('trendingProjects');
      expect(fields).toHaveProperty('featuredProjects');
      expect(fields).toHaveProperty('systemHealth');
    });

    it('should have correct return types for enhanced queries', () => {
      const queryType = schema.getQueryType();
      const fields = queryType?.getFields();

      expect(fields?.enhancedProjects.type.toString()).toBe('ProjectConnection!');
      expect(fields?.searchProjects.type.toString()).toBe('[Project!]!');
      expect(fields?.projectStatistics.type.toString()).toBe('ProjectAggregation!');
      expect(fields?.trendingProjects.type.toString()).toBe('[Project!]!');
      expect(fields?.featuredProjects.type.toString()).toBe('[Project!]!');
      expect(fields?.systemHealth.type.toString()).toBe('SystemHealthStatus!');
    });
  });

  describe('Scalar Types', () => {
    it('should have DateTime scalar type', () => {
      const dateTimeType = schema.getType('DateTime');
      expect(dateTimeType).toBeDefined();
      expect(isScalarType(dateTimeType)).toBe(true);
    });

    it('should have JSON scalar type', () => {
      const jsonType = schema.getType('JSON');
      expect(jsonType).toBeDefined();
      expect(isScalarType(jsonType)).toBe(true);
    });
  });

  describe('Enum Types', () => {
    it('should have ProjectSortField enum', () => {
      const projectSortFieldType = schema.getType('ProjectSortField');
      expect(projectSortFieldType).toBeDefined();
      expect(isEnumType(projectSortFieldType)).toBe(true);

      if (isEnumType(projectSortFieldType)) {
        const values = projectSortFieldType.getValues();
        const valueNames = values.map(v => v.name);

        expect(valueNames).toContain('CREATED_AT');
        expect(valueNames).toContain('UPDATED_AT');
        expect(valueNames).toContain('STARS');
        expect(valueNames).toContain('FORKS');
        expect(valueNames).toContain('LAST_COMMIT');
        expect(valueNames).toContain('POPULARITY');
        expect(valueNames).toContain('TITLE');
      }
    });

    it('should have SortOrder enum', () => {
      const sortOrderType = schema.getType('SortOrder');
      expect(sortOrderType).toBeDefined();
      expect(isEnumType(sortOrderType)).toBe(true);

      if (isEnumType(sortOrderType)) {
        const values = sortOrderType.getValues();
        const valueNames = values.map(v => v.name);

        expect(valueNames).toContain('ASC');
        expect(valueNames).toContain('DESC');
      }
    });
  });

  describe('Schema Completeness', () => {
    it('should have all required types for real-time subscriptions', () => {
      const requiredTypes = [
        'Subscription',
        'SyncStatusUpdate',
        'EnrichmentStatusUpdate',
        'ProfileViewEvent',
        'SystemHealthStatus',
        'ServiceHealth',
        'SystemMetrics',
      ];

      requiredTypes.forEach(typeName => {
        const type = schema.getType(typeName);
        expect(type).toBeDefined();
      });
    });

    it('should have all required types for enhanced queries', () => {
      const requiredTypes = [
        'ProjectConnection',
        'ProjectEdge',
        'ProjectAggregation',
        'LanguageStats',
        'CategoryStats',
        'PlatformStats',
        'EnhancedProjectFilterInput',
        'ProjectSortInput',
        'PaginationInput',
        'PageInfo',
      ];

      requiredTypes.forEach(typeName => {
        const type = schema.getType(typeName);
        expect(type).toBeDefined();
      });
    });

    it('should have all required input types for filtering', () => {
      const requiredInputTypes = [
        'EnhancedProjectFilterInput',
        'ProjectSortInput',
        'PaginationInput',
        'DateRangeInput',
        'NumberRangeInput',
      ];

      requiredInputTypes.forEach(typeName => {
        const type = schema.getType(typeName);
        expect(type).toBeDefined();
      });
    });
  });
});
