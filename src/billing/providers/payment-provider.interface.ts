/**
 * Payment Provider Interface
 * Abstract interface that all payment providers must implement
 */

export interface CustomerInfo {
    userId: string;
    email: string;
    name?: string;
    metadata?: Record<string, string>;
}

export interface CheckoutSessionOptions {
    customer: CustomerInfo;
    priceId: string; // Provider-specific price ID
    tierName: string;
    billingCycle: 'monthly' | 'yearly';
    successUrl: string;
    cancelUrl: string;
    trialDays?: number;
    metadata?: Record<string, string>;
}

export interface CheckoutSession {
    sessionId: string;
    checkoutUrl: string;
    expiresAt?: Date;
}

export interface PortalSessionOptions {
    customerId: string;
    returnUrl: string;
}

export interface PortalSession {
    portalUrl: string;
    expiresAt?: Date;
}

export interface SubscriptionInfo {
    id: string;
    customerId: string;
    status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'paused';
    priceId: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    trialEnd?: Date;
    metadata?: Record<string, string>;
}

export interface PaymentInfo {
    id: string;
    amount: number;
    currency: string;
    status: 'succeeded' | 'pending' | 'failed' | 'refunded';
    customerId: string;
    subscriptionId?: string;
    invoiceId?: string;
    invoiceUrl?: string;
    receiptUrl?: string;
    description?: string;
    paidAt?: Date;
    metadata?: Record<string, string>;
}

export interface InvoiceInfo {
    id: string;
    customerId: string;
    subscriptionId?: string;
    amount: number;
    currency: string;
    status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
    invoiceUrl: string;
    pdfUrl?: string;
    periodStart: Date;
    periodEnd: Date;
    createdAt: Date;
}

export interface RefundResult {
    id: string;
    paymentId: string;
    amount: number;
    currency: string;
    status: 'succeeded' | 'pending' | 'failed';
    reason?: string;
}

export interface WebhookEvent {
    id: string;
    type: string;
    data: any;
    timestamp: Date;
}

/**
 * Abstract Payment Provider Interface
 */
export interface PaymentProvider {
    readonly name: string;

    /**
     * Create a checkout session for the customer
     */
    createCheckoutSession(options: CheckoutSessionOptions): Promise<CheckoutSession>;

    /**
     * Create a billing portal session for the customer to manage their subscription
     */
    createPortalSession(options: PortalSessionOptions): Promise<PortalSession>;

    /**
     * Get subscription details
     */
    getSubscription(subscriptionId: string): Promise<SubscriptionInfo | null>;

    /**
     * Cancel a subscription
     */
    cancelSubscription(subscriptionId: string, immediately?: boolean): Promise<void>;

    /**
     * Resume a canceled subscription
     */
    resumeSubscription(subscriptionId: string): Promise<void>;

    /**
     * Get payment history for a customer
     */
    getPayments(customerId: string, limit?: number): Promise<PaymentInfo[]>;

    /**
     * Get invoices for a customer
     */
    getInvoices(customerId: string, limit?: number): Promise<InvoiceInfo[]>;

    /**
     * Create a refund
     */
    createRefund(paymentId: string, amount?: number, reason?: string): Promise<RefundResult>;

    /**
     * Verify and parse a webhook event
     */
    verifyWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent | null>;

    /**
     * Create or get existing customer
     */
    getOrCreateCustomer(info: CustomerInfo): Promise<string>;
}
