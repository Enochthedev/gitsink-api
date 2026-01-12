import { Module, forwardRef } from '@nestjs/common';
import { ParserService } from './parser.service';
import { MetadataService } from './metadata.service';
import { MetadataController } from './metadata.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [MetadataController],
  providers: [ParserService, MetadataService],
  exports: [ParserService, MetadataService],
})
export class ParserModule { }
