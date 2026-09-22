import { Module, forwardRef } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { TiersService } from './tiers.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, TiersService],
  exports: [SubscriptionsService, TiersService],
})
export class SubscriptionsModule {}
