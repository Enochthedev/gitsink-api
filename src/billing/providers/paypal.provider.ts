import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    PaymentProvider,
    CustomerInfo,
    CheckoutSessionOptions,
    CheckoutSession,
    PortalSessionOptions,
    PortalSession,
    SubscriptionInfo,
    PaymentInfo,
    InvoiceInfo,
    RefundResult,
    WebhookEvent,
} from './payment-provider.interface';

interface PayPalToken {
    access_token: string;
    expires_in: number;
    expiresAt: number;
}

@Injectable()
export class PayPalProvider implements PaymentProvider {
    readonly name = 'paypal';
    private readonly logger = new Logger(PayPalProvider.name);
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly webhookId: string;
    private readonly mode: 'sandbox' | 'live';
    private readonly baseUrl: string;
    private token: PayPalToken | null = null;

    constructor(private readonly configService: ConfigService) {
        this.clientId = this.configService.get<string>('PAYPAL_CLIENT_ID') || '';
        this.clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET') || '';
        this.webhookId = this.configService.get<string>('PAYPAL_WEBHOOK_ID') || '';
        this.mode = (this.configService.get<string>('PAYPAL_MODE') || 'sandbox') as 'sandbox' | 'live';
        this.baseUrl = this.mode === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';

        if (this.clientId && this.clientSecret) {
            this.logger.log(`PayPal provider initialized in ${this.mode} mode`);
        } else {
            this.logger.warn('PayPal credentials not configured. PayPal payments disabled.');
        }
    }

    private async getAccessToken(): Promise<string> {
        if (this.token && this.token.expiresAt > Date.now()) {
            return this.token.access_token;
        }

        const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

        const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials',
        });

        if (!response.ok) {
            throw new Error(`PayPal auth failed: ${response.statusText}`);
        }

        const data = await response.json();
        this.token = {
            access_token: data.access_token,
            expires_in: data.expires_in,
            expiresAt: Date.now() + (data.expires_in - 60) * 1000, // 1 minute buffer
        };

        return this.token.access_token;
    }

    private async paypalRequest(method: string, path: string, body?: any): Promise<any> {
        const token = await this.getAccessToken();

        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`PayPal API error: ${response.status} ${text}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            return response.json();
        }
        return null;
    }

    async createCheckoutSession(options: CheckoutSessionOptions): Promise<CheckoutSession> {
        // Create subscription via PayPal
        const subscription = await this.paypalRequest('POST', '/v1/billing/subscriptions', {
            plan_id: options.priceId,
            subscriber: {
                email_address: options.customer.email,
                name: {
                    given_name: options.customer.name?.split(' ')[0] || 'User',
                    surname: options.customer.name?.split(' ').slice(1).join(' ') || '',
                },
            },
            application_context: {
                brand_name: 'GitSink',
                return_url: options.successUrl,
                cancel_url: options.cancelUrl,
                user_action: 'SUBSCRIBE_NOW',
            },
            custom_id: options.customer.userId,
        });

        const approveLink = subscription.links?.find((l: any) => l.rel === 'approve');

        return {
            sessionId: subscription.id,
            checkoutUrl: approveLink?.href || '',
        };
    }

    async createPortalSession(_options: PortalSessionOptions): Promise<PortalSession> {
        // PayPal doesn't have a customer portal like Stripe
        // Direct users to PayPal's subscription management
        return {
            portalUrl: `https://www.${this.mode === 'live' ? '' : 'sandbox.'}paypal.com/myaccount/autopay`,
        };
    }

    async getSubscription(subscriptionId: string): Promise<SubscriptionInfo | null> {
        try {
            const subscription = await this.paypalRequest('GET', `/v1/billing/subscriptions/${subscriptionId}`);

            return {
                id: subscription.id,
                customerId: subscription.subscriber?.email_address || '',
                status: this.mapPayPalStatus(subscription.status),
                priceId: subscription.plan_id,
                currentPeriodStart: new Date(subscription.billing_info?.last_payment?.time || subscription.create_time),
                currentPeriodEnd: new Date(subscription.billing_info?.next_billing_time || Date.now()),
                cancelAtPeriodEnd: false,
                metadata: { custom_id: subscription.custom_id },
            };
        } catch (error) {
            this.logger.error(`Failed to get subscription ${subscriptionId}:`, error);
            return null;
        }
    }

    async cancelSubscription(subscriptionId: string, immediately: boolean = false): Promise<void> {
        if (immediately) {
            await this.paypalRequest('POST', `/v1/billing/subscriptions/${subscriptionId}/cancel`, {
                reason: 'User requested cancellation',
            });
        } else {
            // PayPal doesn't natively support cancel-at-period-end
            // This would need to be handled in the webhook/billing logic
            await this.paypalRequest('POST', `/v1/billing/subscriptions/${subscriptionId}/suspend`, {
                reason: 'User requested cancellation at period end',
            });
        }
    }

    async resumeSubscription(subscriptionId: string): Promise<void> {
        await this.paypalRequest('POST', `/v1/billing/subscriptions/${subscriptionId}/activate`, {
            reason: 'User resumed subscription',
        });
    }

    async getPayments(customerId: string, limit: number = 10): Promise<PaymentInfo[]> {
        // PayPal payment history would be retrieved differently
        // This is a simplified implementation
        this.logger.debug(`Getting payments for customer: ${customerId}, limit: ${limit}`);
        return [];
    }

    async getInvoices(_customerId: string, _limit: number = 10): Promise<InvoiceInfo[]> {
        // PayPal invoices would need Invoicing API
        return [];
    }

    async createRefund(paymentId: string, amount?: number, reason?: string): Promise<RefundResult> {
        const refund = await this.paypalRequest('POST', `/v2/payments/captures/${paymentId}/refund`, {
            amount: amount ? {
                value: amount.toFixed(2),
                currency_code: 'USD',
            } : undefined,
            note_to_payer: reason,
        });

        return {
            id: refund.id,
            paymentId,
            amount: parseFloat(refund.amount?.value || '0'),
            currency: refund.amount?.currency_code || 'USD',
            status: refund.status === 'COMPLETED' ? 'succeeded' : 'pending',
            reason,
        };
    }

    async verifyWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent | null> {
        try {
            // PayPal webhook verification
            const body = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());

            // In production, verify with PayPal's webhook verification API
            // For now, just parse the event
            return {
                id: body.id,
                type: body.event_type,
                data: body.resource,
                timestamp: new Date(body.create_time),
            };
        } catch (error) {
            this.logger.error('Webhook verification failed:', error);
            return null;
        }
    }

    async getOrCreateCustomer(info: CustomerInfo): Promise<string> {
        // PayPal doesn't have a separate customer object like Stripe
        // Return the email as the customer identifier
        return info.email;
    }

    private mapPayPalStatus(status: string): SubscriptionInfo['status'] {
        switch (status) {
            case 'ACTIVE':
                return 'active';
            case 'CANCELLED':
                return 'canceled';
            case 'SUSPENDED':
                return 'paused';
            default:
                return 'active';
        }
    }
}
