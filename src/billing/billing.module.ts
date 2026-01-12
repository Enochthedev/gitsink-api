import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeProvider } from './providers/stripe.provider';
import { PayPalProvider } from './providers/paypal.provider';
import { LemonSqueezyProvider } from './providers/lemonsqueezy.provider';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        ConfigModule,
        PrismaModule,
        forwardRef(() => SubscriptionsModule),
        forwardRef(() => AuthModule),
    ],
    controllers: [BillingController],
    providers: [
        BillingService,
        StripeProvider,
        PayPalProvider,
        LemonSqueezyProvider,
    ],
    exports: [BillingService],
})
export class BillingModule { }
