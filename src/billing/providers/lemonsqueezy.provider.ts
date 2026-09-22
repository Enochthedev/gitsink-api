import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { createHmac } from 'crypto';

@Injectable()
export class LemonSqueezyProvider implements PaymentProvider {
  readonly name = 'lemonsqueezy';
  private readonly logger = new Logger(LemonSqueezyProvider.name);
  private readonly apiKey: string;
  private readonly storeId: string;
  private readonly webhookSecret: string;
  private readonly baseUrl = 'https://api.lemonsqueezy.com/v1';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('LEMONSQUEEZY_API_KEY') || '';
    this.storeId = this.configService.get<string>('LEMONSQUEEZY_STORE_ID') || '';
    this.webhookSecret = this.configService.get<string>('LEMONSQUEEZY_WEBHOOK_SECRET') || '';

    if (this.apiKey && this.storeId) {
      this.logger.log('LemonSqueezy provider initialized');
    } else {
      this.logger.warn('LemonSqueezy credentials not configured. LemonSqueezy payments disabled.');
    }
  }

  private async lsRequest(method: string, path: string, body?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LemonSqueezy API error: ${response.status} ${text}`);
    }

    const contentType = response.headers.get('content-type');
    if (
      contentType?.includes('application/json') ||
      contentType?.includes('application/vnd.api+json')
    ) {
      return response.json();
    }
    return null;
  }

  async createCheckoutSession(options: CheckoutSessionOptions): Promise<CheckoutSession> {
    // Create checkout via LemonSqueezy
    const checkout = await this.lsRequest('POST', '/checkouts', {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: options.customer.email,
            name: options.customer.name,
            custom: {
              user_id: options.customer.userId,
              tier_name: options.tierName,
              billing_cycle: options.billingCycle,
            },
          },
          checkout_options: {
            embed: false,
          },
          product_options: {
            redirect_url: options.successUrl,
          },
        },
        relationships: {
          store: {
            data: {
              type: 'stores',
              id: this.storeId,
            },
          },
          variant: {
            data: {
              type: 'variants',
              id: options.priceId, // LemonSqueezy variant ID
            },
          },
        },
      },
    });

    return {
      sessionId: checkout.data.id,
      checkoutUrl: checkout.data.attributes.url,
      expiresAt: checkout.data.attributes.expires_at
        ? new Date(checkout.data.attributes.expires_at)
        : undefined,
    };
  }

  async createPortalSession(options: PortalSessionOptions): Promise<PortalSession> {
    // Get customer portal URL from subscription
    const subscriptions = await this.lsRequest(
      'GET',
      `/subscriptions?filter[user_email]=${encodeURIComponent(options.customerId)}`,
    );

    if (subscriptions.data?.length > 0) {
      return {
        portalUrl: subscriptions.data[0].attributes.urls?.customer_portal || '',
      };
    }

    // Default customer portal URL
    return {
      portalUrl: 'https://app.lemonsqueezy.com/my-orders',
    };
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionInfo | null> {
    try {
      const response = await this.lsRequest('GET', `/subscriptions/${subscriptionId}`);
      const sub = response.data;

      return {
        id: sub.id,
        customerId: sub.attributes.customer_id?.toString() || '',
        status: this.mapLsStatus(sub.attributes.status),
        priceId: sub.attributes.variant_id?.toString() || '',
        currentPeriodStart: new Date(sub.attributes.renews_at || sub.attributes.created_at),
        currentPeriodEnd: new Date(sub.attributes.renews_at || Date.now()),
        cancelAtPeriodEnd: sub.attributes.cancelled,
        trialEnd: sub.attributes.trial_ends_at ? new Date(sub.attributes.trial_ends_at) : undefined,
        metadata: sub.attributes.custom_data || {},
      };
    } catch (error) {
      this.logger.error(`Failed to get subscription ${subscriptionId}:`, error);
      return null;
    }
  }

  async cancelSubscription(subscriptionId: string, immediately: boolean = false): Promise<void> {
    if (immediately) {
      await this.lsRequest('DELETE', `/subscriptions/${subscriptionId}`);
    } else {
      await this.lsRequest('PATCH', `/subscriptions/${subscriptionId}`, {
        data: {
          type: 'subscriptions',
          id: subscriptionId,
          attributes: {
            cancelled: true,
          },
        },
      });
    }
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    await this.lsRequest('PATCH', `/subscriptions/${subscriptionId}`, {
      data: {
        type: 'subscriptions',
        id: subscriptionId,
        attributes: {
          cancelled: false,
        },
      },
    });
  }

  async getPayments(customerId: string, limit: number = 10): Promise<PaymentInfo[]> {
    try {
      const response = await this.lsRequest(
        'GET',
        `/subscription-invoices?filter[store_id]=${this.storeId}&page[size]=${limit}`,
      );

      return response.data
        .filter((inv: any) => inv.attributes.customer_id?.toString() === customerId)
        .map((inv: any) => ({
          id: inv.id,
          amount: inv.attributes.total / 100,
          currency: inv.attributes.currency?.toUpperCase() || 'USD',
          status: inv.attributes.status === 'paid' ? 'succeeded' : 'pending',
          customerId,
          invoiceUrl: inv.attributes.urls?.invoice_url,
          receiptUrl: inv.attributes.urls?.invoice_url,
          paidAt: inv.attributes.paid_at ? new Date(inv.attributes.paid_at) : undefined,
        }));
    } catch (error) {
      this.logger.error(`Failed to get payments for ${customerId}:`, error);
      return [];
    }
  }

  async getInvoices(customerId: string, limit: number = 10): Promise<InvoiceInfo[]> {
    const payments = await this.getPayments(customerId, limit);
    return payments.map(p => ({
      id: p.id,
      customerId,
      amount: p.amount,
      currency: p.currency,
      status: p.status === 'succeeded' ? 'paid' : 'open',
      invoiceUrl: p.invoiceUrl || '',
      periodStart: p.paidAt || new Date(),
      periodEnd: p.paidAt || new Date(),
      createdAt: p.paidAt || new Date(),
    }));
  }

  async createRefund(paymentId: string, amount?: number, reason?: string): Promise<RefundResult> {
    // LemonSqueezy refunds are typically done through their dashboard
    // API support for refunds may be limited
    this.logger.warn(`Refund requested for ${paymentId}. Manual processing may be required.`);

    return {
      id: `refund_${paymentId}`,
      paymentId,
      amount: amount || 0,
      currency: 'USD',
      status: 'pending',
      reason,
    };
  }

  async verifyWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent | null> {
    try {
      const payloadStr = typeof payload === 'string' ? payload : payload.toString();

      // Verify signature
      const computedSignature = createHmac('sha256', this.webhookSecret)
        .update(payloadStr)
        .digest('hex');

      if (signature !== computedSignature) {
        this.logger.error('Webhook signature verification failed');
        return null;
      }

      const body = JSON.parse(payloadStr);

      return {
        id: body.meta?.event_name || body.id,
        type: body.meta?.event_name || 'unknown',
        data: body.data,
        timestamp: new Date(body.meta?.created_at || Date.now()),
      };
    } catch (error) {
      this.logger.error('Webhook verification failed:', error);
      return null;
    }
  }

  async getOrCreateCustomer(info: CustomerInfo): Promise<string> {
    // LemonSqueezy customers are created during checkout
    // Return email as identifier for now
    return info.email;
  }

  private mapLsStatus(status: string): SubscriptionInfo['status'] {
    switch (status) {
      case 'active':
        return 'active';
      case 'cancelled':
        return 'canceled';
      case 'paused':
        return 'paused';
      case 'past_due':
        return 'past_due';
      case 'on_trial':
        return 'trialing';
      default:
        return 'active';
    }
  }
}
