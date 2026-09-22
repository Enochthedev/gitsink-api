import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StripeProvider } from './providers/stripe.provider';
import { PayPalProvider } from './providers/paypal.provider';
import { LemonSqueezyProvider } from './providers/lemonsqueezy.provider';
import { PaymentProvider, WebhookEvent } from './providers/payment-provider.interface';
import { TiersService } from '../subscriptions/tiers.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
  BillingPortalResponseDto,
  CheckoutResponseDto,
  CreateCheckoutDto,
  InvoiceResponseDto,
  PaymentProvider as PaymentProviderEnum,
  PaymentResponseDto,
} from './dto/billing.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly providers: Map<string, PaymentProvider>;
  private readonly defaultSuccessUrl: string;
  private readonly defaultCancelUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tiersService: TiersService,
    private readonly subscriptionsService: SubscriptionsService,
    stripeProvider: StripeProvider,
    paypalProvider: PayPalProvider,
    lemonSqueezyProvider: LemonSqueezyProvider,
  ) {
    this.providers = new Map<string, PaymentProvider>();
    this.providers.set('stripe', stripeProvider);
    this.providers.set('paypal', paypalProvider);
    this.providers.set('lemonsqueezy', lemonSqueezyProvider);

    this.defaultSuccessUrl =
      this.configService.get<string>('BILLING_SUCCESS_URL') ||
      'http://localhost:3000/billing/success';
    this.defaultCancelUrl =
      this.configService.get<string>('BILLING_CANCEL_URL') ||
      'http://localhost:3000/billing/cancel';
  }

  /**
   * Get the appropriate payment provider
   */
  private getProvider(name: string): PaymentProvider {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new BadRequestException(`Payment provider '${name}' is not supported`);
    }
    return provider;
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckout(userId: string, dto: CreateCheckoutDto): Promise<CheckoutResponseDto> {
    const tier = await this.tiersService.getTierByName(dto.tierName);
    if (!tier) {
      throw new NotFoundException(`Tier '${dto.tierName}' not found`);
    }

    if (tier.name === 'free') {
      throw new BadRequestException('Cannot checkout for free tier. Use upgrade endpoint.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const provider = this.getProvider(dto.provider);
    const billingCycle = dto.billingCycle || 'monthly';

    // Get the price ID from tier based on provider and cycle
    const priceId = this.getPriceIdForTier(tier, dto.provider, billingCycle);
    if (!priceId) {
      throw new BadRequestException(
        `No ${billingCycle} price configured for ${tier.displayName} with ${dto.provider}`,
      );
    }

    const session = await provider.createCheckoutSession({
      customer: {
        userId,
        email: user.email,
        name: user.username || undefined,
      },
      priceId,
      tierName: tier.name,
      billingCycle,
      successUrl: dto.successUrl || this.defaultSuccessUrl,
      cancelUrl: dto.cancelUrl || this.defaultCancelUrl,
    });

    return {
      checkoutUrl: session.checkoutUrl,
      sessionId: session.sessionId,
      provider: dto.provider,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Create billing portal session for managing subscription
   */
  async createPortalSession(userId: string, provider: string): Promise<BillingPortalResponseDto> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription || !subscription.externalCustomerId) {
      throw new BadRequestException('No active subscription found');
    }

    const paymentProvider = this.getProvider(provider);
    const session = await paymentProvider.createPortalSession({
      customerId: subscription.externalCustomerId,
      returnUrl:
        this.configService.get<string>('BILLING_RETURN_URL') || 'http://localhost:3000/settings',
    });

    return {
      portalUrl: session.portalUrl,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Get payment history for user
   */
  async getPayments(userId: string, limit: number = 20): Promise<PaymentResponseDto[]> {
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return payments.map(p => ({
      id: p.id,
      amount: p.amount instanceof Decimal ? p.amount.toNumber() : Number(p.amount),
      currency: p.currency,
      status: p.status,
      type: p.type,
      paymentProvider: p.paymentProvider,
      invoiceUrl: p.invoiceUrl || undefined,
      receiptUrl: p.receiptUrl || undefined,
      description: p.description || undefined,
      paidAt: p.paidAt || undefined,
      createdAt: p.createdAt,
    }));
  }

  /**
   * Get invoices for user
   */
  async getInvoices(userId: string, limit: number = 20): Promise<InvoiceResponseDto[]> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription || !subscription.externalCustomerId || !subscription.paymentProvider) {
      return [];
    }

    const provider = this.getProvider(subscription.paymentProvider);
    return provider.getInvoices(subscription.externalCustomerId, limit);
  }

  /**
   * Handle webhook events from payment providers
   */
  async handleWebhook(
    provider: string,
    payload: string | Buffer,
    signature: string,
  ): Promise<{ received: boolean }> {
    const paymentProvider = this.getProvider(provider);
    const event = await paymentProvider.verifyWebhook(payload, signature);

    if (!event) {
      this.logger.warn(`Invalid webhook signature from ${provider}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Processing ${provider} webhook: ${event.type}`);

    try {
      await this.processWebhookEvent(provider, event);
      return { received: true };
    } catch (error) {
      this.logger.error('Error processing webhook:', error);
      throw error;
    }
  }

  /**
   * Process webhook event
   */
  private async processWebhookEvent(provider: string, event: WebhookEvent): Promise<void> {
    switch (provider) {
      case 'stripe':
        await this.processStripeEvent(event);
        break;
      case 'paypal':
        await this.processPayPalEvent(event);
        break;
      case 'lemonsqueezy':
        await this.processLemonSqueezyEvent(event);
        break;
    }
  }

  /**
   * Process Stripe webhook events
   */
  private async processStripeEvent(event: WebhookEvent): Promise<void> {
    const data = event.data;

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutComplete(
          data.metadata?.userId,
          data.customer,
          data.subscription,
          data.metadata?.tierName,
          'stripe',
        );
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdate(
          data.metadata?.userId,
          data.id,
          data.status,
          data.cancel_at_period_end,
          'stripe',
        );
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(data.metadata?.userId, 'stripe');
        break;

      case 'invoice.paid':
        await this.recordPayment(
          data.customer,
          data.subscription,
          data.amount_paid / 100,
          data.currency?.toUpperCase() || 'USD',
          'succeeded',
          'stripe',
          data.id,
          data.hosted_invoice_url,
        );
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(data.customer, data.subscription, 'stripe');
        break;
    }
  }

  /**
   * Process PayPal webhook events
   */
  private async processPayPalEvent(event: WebhookEvent): Promise<void> {
    const data = event.data;

    switch (event.type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await this.handleCheckoutComplete(
          data.custom_id,
          data.subscriber?.email_address,
          data.id,
          data.custom_data?.tier_name,
          'paypal',
        );
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await this.handleSubscriptionDeleted(data.custom_id, 'paypal');
        break;

      case 'PAYMENT.SALE.COMPLETED':
        await this.recordPayment(
          data.billing_agreement_id,
          data.billing_agreement_id,
          parseFloat(data.amount?.total || '0'),
          data.amount?.currency || 'USD',
          'succeeded',
          'paypal',
          data.id,
        );
        break;
    }
  }

  /**
   * Process LemonSqueezy webhook events
   */
  private async processLemonSqueezyEvent(event: WebhookEvent): Promise<void> {
    const data = event.data;
    const customData = data.attributes?.custom_data || {};

    switch (event.type) {
      case 'subscription_created':
        await this.handleCheckoutComplete(
          customData.user_id,
          data.attributes?.customer_id?.toString(),
          data.id,
          customData.tier_name,
          'lemonsqueezy',
        );
        break;

      case 'subscription_updated':
        await this.handleSubscriptionUpdate(
          customData.user_id,
          data.id,
          data.attributes?.status,
          data.attributes?.cancelled,
          'lemonsqueezy',
        );
        break;

      case 'subscription_cancelled':
        await this.handleSubscriptionDeleted(customData.user_id, 'lemonsqueezy');
        break;

      case 'subscription_payment_success':
        await this.recordPayment(
          data.attributes?.customer_id?.toString(),
          data.id,
          data.attributes?.total / 100,
          data.attributes?.currency?.toUpperCase() || 'USD',
          'succeeded',
          'lemonsqueezy',
          data.id,
        );
        break;
    }
  }

  /**
   * Handle successful checkout
   */
  private async handleCheckoutComplete(
    userId: string | undefined,
    customerId: string,
    subscriptionId: string,
    tierName: string | undefined,
    provider: string,
  ): Promise<void> {
    if (!userId) {
      this.logger.warn('Checkout completed but no userId found');
      return;
    }

    const tier = tierName
      ? await this.tiersService.getTierByName(tierName)
      : await this.tiersService.getTierByName('pro'); // Default to pro

    if (!tier) {
      this.logger.error(`Tier ${tierName} not found`);
      return;
    }

    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        tierId: tier.id,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        paymentProvider: provider,
        externalSubscriptionId: subscriptionId,
        externalCustomerId: customerId,
      },
      update: {
        tierId: tier.id,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        paymentProvider: provider,
        externalSubscriptionId: subscriptionId,
        externalCustomerId: customerId,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    });

    this.logger.log(`Subscription activated for user ${userId}`);
  }

  /**
   * Handle subscription update
   */
  private async handleSubscriptionUpdate(
    userId: string | undefined,
    subscriptionId: string,
    status: string,
    cancelAtPeriodEnd: boolean,
    provider: string,
  ): Promise<void> {
    if (!userId) return;

    const mappedStatus = this.mapProviderStatus(status, provider);

    await this.prisma.subscription.updateMany({
      where: { userId },
      data: {
        status: mappedStatus,
        cancelAtPeriodEnd,
      },
    });
  }

  /**
   * Handle subscription deleted/canceled
   */
  private async handleSubscriptionDeleted(
    userId: string | undefined,
    provider: string,
  ): Promise<void> {
    if (!userId) return;

    // Downgrade to free tier
    const freeTierId = await this.tiersService.getFreeTierId();
    const now = new Date();
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 100);

    await this.prisma.subscription.updateMany({
      where: { userId },
      data: {
        tierId: freeTierId,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: farFuture,
        paymentProvider: null,
        externalSubscriptionId: null,
        externalCustomerId: null,
        cancelAtPeriodEnd: false,
      },
    });

    this.logger.log(`User ${userId} downgraded to free tier`);
  }

  /**
   * Record a payment in the database
   */
  private async recordPayment(
    customerId: string,
    subscriptionId: string,
    amount: number,
    currency: string,
    status: string,
    provider: string,
    externalPaymentId: string,
    invoiceUrl?: string,
  ): Promise<void> {
    // Find user by customer ID
    const subscription = await this.prisma.subscription.findFirst({
      where: { externalCustomerId: customerId },
    });

    if (!subscription) {
      this.logger.warn(`No subscription found for customer ${customerId}`);
      return;
    }

    await this.prisma.payment.create({
      data: {
        userId: subscription.userId,
        subscriptionId: subscription.id,
        amount,
        currency,
        status,
        type: 'subscription',
        paymentProvider: provider,
        externalPaymentId,
        invoiceUrl,
        paidAt: status === 'succeeded' ? new Date() : null,
      },
    });

    // Update period end if payment successful
    if (status === 'succeeded') {
      const newPeriodEnd = new Date();
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodEnd: newPeriodEnd,
          currentApiCalls: 0, // Reset usage
        },
      });
    }
  }

  /**
   * Handle payment failure
   */
  private async handlePaymentFailed(
    customerId: string,
    subscriptionId: string,
    provider: string,
  ): Promise<void> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { externalCustomerId: customerId },
    });

    if (subscription) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'past_due' },
      });
    }
  }

  /**
   * Get price ID from tier based on provider and cycle
   */
  private getPriceIdForTier(tier: any, provider: string, cycle: string): string | null {
    switch (provider) {
      case 'stripe':
        return cycle === 'yearly' ? tier.stripePriceIdYearly : tier.stripePriceIdMonthly;
      case 'paypal':
        return cycle === 'yearly' ? tier.paypalPlanIdYearly : tier.paypalPlanIdMonthly;
      case 'lemonsqueezy':
        return cycle === 'yearly'
          ? tier.lemonSqueezyVariantIdYearly
          : tier.lemonSqueezyVariantIdMonthly;
      default:
        return null;
    }
  }

  /**
   * Map provider-specific status to our status
   */
  private mapProviderStatus(status: string, provider: string): string {
    const statusMap: Record<string, Record<string, string>> = {
      stripe: {
        active: 'active',
        canceled: 'canceled',
        past_due: 'past_due',
        trialing: 'trialing',
        paused: 'paused',
      },
      paypal: {
        ACTIVE: 'active',
        CANCELLED: 'canceled',
        SUSPENDED: 'paused',
      },
      lemonsqueezy: {
        active: 'active',
        cancelled: 'canceled',
        past_due: 'past_due',
        on_trial: 'trialing',
        paused: 'paused',
      },
    };

    return statusMap[provider]?.[status] || 'active';
  }
}
