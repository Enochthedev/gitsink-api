import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  CheckoutSession,
  CheckoutSessionOptions,
  CustomerInfo,
  InvoiceInfo,
  PaymentInfo,
  PaymentProvider,
  PortalSession,
  PortalSessionOptions,
  RefundResult,
  SubscriptionInfo,
  WebhookEvent,
} from './payment-provider.interface';

@Injectable()
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly logger = new Logger(StripeProvider.name);
  private stripe: Stripe | null = null;
  private webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || '';

    if (secretKey) {
      this.stripe = new Stripe(secretKey);
      this.logger.log('Stripe provider initialized');
    } else {
      this.logger.warn('Stripe secret key not configured. Stripe payments disabled.');
    }
  }

  private ensureInitialized(): Stripe {
    if (!this.stripe) {
      throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY.');
    }
    return this.stripe;
  }

  async createCheckoutSession(options: CheckoutSessionOptions): Promise<CheckoutSession> {
    const stripe = this.ensureInitialized();

    const customerId = await this.getOrCreateCustomer(options.customer);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: options.priceId,
          quantity: 1,
        },
      ],
      success_url: options.successUrl,
      cancel_url: options.cancelUrl,
      subscription_data: {
        trial_period_days: options.trialDays,
        metadata: {
          userId: options.customer.userId,
          tierName: options.tierName,
          billingCycle: options.billingCycle,
          ...options.metadata,
        },
      },
      metadata: {
        userId: options.customer.userId,
        tierName: options.tierName,
      },
    });

    return {
      sessionId: session.id,
      checkoutUrl: session.url || '',
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
    };
  }

  async createPortalSession(options: PortalSessionOptions): Promise<PortalSession> {
    const stripe = this.ensureInitialized();

    const session = await stripe.billingPortal.sessions.create({
      customer: options.customerId,
      return_url: options.returnUrl,
    });

    return {
      portalUrl: session.url,
    };
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionInfo | null> {
    const stripe = this.ensureInitialized();

    try {
      const subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as any;

      return {
        id: subscription.id,
        customerId: subscription.customer as string,
        status: this.mapStripeStatus(subscription.status),
        priceId: subscription.items?.data?.[0]?.price?.id || '',
        currentPeriodStart: new Date((subscription.current_period_start || 0) * 1000),
        currentPeriodEnd: new Date((subscription.current_period_end || 0) * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
        metadata: subscription.metadata as Record<string, string>,
      };
    } catch (error) {
      this.logger.error(`Failed to get subscription ${subscriptionId}:`, error);
      return null;
    }
  }

  async cancelSubscription(subscriptionId: string, immediately: boolean = false): Promise<void> {
    const stripe = this.ensureInitialized();

    if (immediately) {
      await stripe.subscriptions.cancel(subscriptionId);
    } else {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    const stripe = this.ensureInitialized();

    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
  }

  async getPayments(customerId: string, limit: number = 10): Promise<PaymentInfo[]> {
    const stripe = this.ensureInitialized();

    const charges = await stripe.charges.list({
      customer: customerId,
      limit,
    });

    return charges.data.map((charge: any) => ({
      id: charge.id,
      amount: (charge.amount || 0) / 100, // Convert from cents
      currency: (charge.currency || 'usd').toUpperCase(),
      status: this.mapChargeStatus(charge.status),
      customerId: charge.customer as string,
      invoiceId: charge.invoice as string | undefined,
      receiptUrl: charge.receipt_url || undefined,
      description: charge.description || undefined,
      paidAt: charge.paid ? new Date((charge.created || 0) * 1000) : undefined,
      metadata: charge.metadata as Record<string, string>,
    }));
  }

  async getInvoices(customerId: string, limit: number = 10): Promise<InvoiceInfo[]> {
    const stripe = this.ensureInitialized();

    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit,
    });

    return invoices.data.map((invoice: any) => ({
      id: invoice.id,
      customerId: invoice.customer as string,
      subscriptionId: invoice.subscription as string | undefined,
      amount: (invoice.amount_paid || invoice.total || 0) / 100,
      currency: (invoice.currency || 'usd').toUpperCase(),
      status: this.mapInvoiceStatus(invoice.status),
      invoiceUrl: invoice.hosted_invoice_url || '',
      pdfUrl: invoice.invoice_pdf || undefined,
      periodStart: new Date((invoice.period_start || 0) * 1000),
      periodEnd: new Date((invoice.period_end || 0) * 1000),
      createdAt: new Date((invoice.created || 0) * 1000),
    }));
  }

  async createRefund(paymentId: string, amount?: number, reason?: string): Promise<RefundResult> {
    const stripe = this.ensureInitialized();

    const refund = await stripe.refunds.create({
      charge: paymentId,
      amount: amount ? Math.round(amount * 100) : undefined, // Convert to cents
      reason: reason as Stripe.RefundCreateParams.Reason,
    });

    return {
      id: refund.id,
      paymentId: refund.charge as string,
      amount: refund.amount / 100,
      currency: refund.currency.toUpperCase(),
      status:
        refund.status === 'succeeded'
          ? 'succeeded'
          : refund.status === 'pending'
            ? 'pending'
            : 'failed',
      reason,
    };
  }

  async verifyWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent | null> {
    if (!this.stripe) return null;

    try {
      const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);

      return {
        id: event.id,
        type: event.type,
        data: event.data.object,
        timestamp: new Date(event.created * 1000),
      };
    } catch (error) {
      this.logger.error('Webhook verification failed:', error);
      return null;
    }
  }

  async getOrCreateCustomer(info: CustomerInfo): Promise<string> {
    const stripe = this.ensureInitialized();

    // First, try to find existing customer
    const existingCustomers = await stripe.customers.list({
      email: info.email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      return existingCustomers.data[0].id;
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email: info.email,
      name: info.name,
      metadata: {
        userId: info.userId,
        ...info.metadata,
      },
    });

    return customer.id;
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionInfo['status'] {
    switch (status) {
      case 'active':
        return 'active';
      case 'canceled':
        return 'canceled';
      case 'past_due':
        return 'past_due';
      case 'trialing':
        return 'trialing';
      case 'paused':
        return 'paused';
      default:
        return 'active';
    }
  }

  private mapChargeStatus(status: string): PaymentInfo['status'] {
    switch (status) {
      case 'succeeded':
        return 'succeeded';
      case 'pending':
        return 'pending';
      case 'failed':
        return 'failed';
      default:
        return 'pending';
    }
  }

  private mapInvoiceStatus(status: string | null): InvoiceInfo['status'] {
    switch (status) {
      case 'draft':
        return 'draft';
      case 'open':
        return 'open';
      case 'paid':
        return 'paid';
      case 'uncollectible':
        return 'uncollectible';
      case 'void':
        return 'void';
      default:
        return 'open';
    }
  }
}
