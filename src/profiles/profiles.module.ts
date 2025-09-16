import { Module } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { ProfileCustomizationService } from './profile-customization.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesResolver } from './profiles.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PubSubProvider } from '../common/providers/pubsub.provider';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfileCustomizationService, ProfilesResolver, PubSubProvider],
  exports: [ProfilesService, ProfileCustomizationService],
})
export class ProfilesModule {}
