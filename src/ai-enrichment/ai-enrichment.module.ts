import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
// import { AIEnrichmentService } from './ai-enrichment.service';
import { TechnologyDetectionService } from './technology-detection.service';
// import { DescriptionGenerationService } from './description-generation.service';
import { ProjectCategorizationService } from './project-categorization.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule, HttpModule],
  providers: [
    // AIEnrichmentService,
    TechnologyDetectionService,
    // DescriptionGenerationService,
    ProjectCategorizationService,
  ],
  exports: [
    // AIEnrichmentService,
    TechnologyDetectionService,
    // DescriptionGenerationService,
    ProjectCategorizationService,
  ],
})
export class AIEnrichmentModule {}
