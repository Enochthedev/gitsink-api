import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AIEnrichmentService } from './ai-enrichment.service';
import { TechnologyDetectionService } from './technology-detection.service';
import { DescriptionGenerationService } from './description-generation.service';
import { ProjectCategorizationService } from './project-categorization.service';
import { AIEnrichmentResolver } from './ai-enrichment.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PubSubProvider } from '../common/providers/pubsub.provider';

@Module({
  imports: [PrismaModule, ConfigModule, HttpModule, AuthModule],
  providers: [
    AIEnrichmentService,
    TechnologyDetectionService,
    DescriptionGenerationService,
    ProjectCategorizationService,
    AIEnrichmentResolver,
    PubSubProvider,
  ],
  exports: [
    AIEnrichmentService,
    TechnologyDetectionService,
    DescriptionGenerationService,
    ProjectCategorizationService,
  ],
})
export class AIEnrichmentModule {}
