# Implementation Plan: Multi-API Keys, Tiers & Billing

## Overview
This plan covers three major feature additions to the GitSink API:
1. **Multiple API Keys** - Allow users to create and manage multiple API keys
2. **Subscription Tiers** - Implement free/pro/enterprise tiers with feature limits
3. **Billing Integration** - Support multiple payment providers (Stripe, PayPal, LemonSqueezy)

---

## Phase 1: Database Schema Updates

### New Tables

```sql
-- Multiple API Keys
CREATE TABLE "ApiKey" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" VARCHAR(100) NOT NULL,
  "keyHash" VARCHAR(255) NOT NULL UNIQUE,
  "keyPrefix" VARCHAR(20) NOT NULL, -- For display (e.g., "gs_...abc")
  "permissions" TEXT[] DEFAULT ARRAY['read', 'write'],
  "rateLimit" INTEGER DEFAULT 1000, -- Requests per hour
  "expiresAt" TIMESTAMP,
  "lastUsedAt" TIMESTAMP,
  "usageCount" INTEGER DEFAULT 0,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Subscription Tiers
CREATE TABLE "Tier" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(50) NOT NULL UNIQUE, -- 'free', 'pro', 'enterprise'
  "displayName" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "monthlyPrice" DECIMAL(10,2) DEFAULT 0,
  "yearlyPrice" DECIMAL(10,2) DEFAULT 0,
  "limits" JSONB NOT NULL, -- {projects: 5, apiKeys: 1, apiCallsPerMonth: 1000, ...}
  "features" TEXT[] DEFAULT ARRAY[],
  "isPopular" BOOLEAN DEFAULT false,
  "sortOrder" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- User Subscriptions
CREATE TABLE "Subscription" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tierId" UUID NOT NULL REFERENCES "Tier"("id"),
  "status" VARCHAR(20) NOT NULL, -- 'active', 'canceled', 'past_due', 'trialing'
  "currentPeriodStart" TIMESTAMP NOT NULL,
  "currentPeriodEnd" TIMESTAMP NOT NULL,
  "cancelAtPeriodEnd" BOOLEAN DEFAULT false,
  "paymentProvider" VARCHAR(20), -- 'stripe', 'paypal', 'lemonsqueezy'
  "externalSubscriptionId" VARCHAR(255),
  "externalCustomerId" VARCHAR(255),
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Payment History
CREATE TABLE "Payment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "subscriptionId" UUID REFERENCES "Subscription"("id"),
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" VARCHAR(3) DEFAULT 'USD',
  "status" VARCHAR(20) NOT NULL, -- 'succeeded', 'pending', 'failed', 'refunded'
  "paymentProvider" VARCHAR(20) NOT NULL,
  "externalPaymentId" VARCHAR(255),
  "invoiceUrl" VARCHAR(500),
  "receiptUrl" VARCHAR(500),
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP DEFAULT NOW()
);
```

---

## Phase 2: Module Structure

```
src/
├── api-keys/                     # Multiple API Keys module
│   ├── api-keys.module.ts
│   ├── api-keys.controller.ts
│   ├── api-keys.service.ts
│   ├── api-keys.resolver.ts      # GraphQL
│   ├── dto/
│   │   ├── create-api-key.dto.ts
│   │   ├── update-api-key.dto.ts
│   │   └── api-key-response.dto.ts
│   └── entities/
│       └── api-key.entity.ts
│
├── subscriptions/                # Subscription/Tier module
│   ├── subscriptions.module.ts
│   ├── subscriptions.controller.ts
│   ├── subscriptions.service.ts
│   ├── subscriptions.resolver.ts
│   ├── tiers.service.ts
│   ├── dto/
│   │   ├── upgrade-tier.dto.ts
│   │   ├── subscription-response.dto.ts
│   │   └── tier-response.dto.ts
│   ├── entities/
│   │   ├── tier.entity.ts
│   │   └── subscription.entity.ts
│   └── guards/
│       └── tier-feature.guard.ts # Guard for feature gating
│
├── billing/                      # Payment Integration module
│   ├── billing.module.ts
│   ├── billing.controller.ts     # Webhooks endpoint
│   ├── billing.service.ts        # Orchestrator
│   ├── providers/
│   │   ├── payment-provider.interface.ts
│   │   ├── stripe.provider.ts
│   │   ├── paypal.provider.ts
│   │   └── lemonsqueezy.provider.ts
│   ├── webhooks/
│   │   ├── stripe-webhook.handler.ts
│   │   ├── paypal-webhook.handler.ts
│   │   └── lemonsqueezy-webhook.handler.ts
│   ├── dto/
│   │   ├── create-checkout.dto.ts
│   │   ├── payment-response.dto.ts
│   │   └── invoice-response.dto.ts
│   └── entities/
│       └── payment.entity.ts
```

---

## Phase 3: API Endpoints

### Multiple API Keys Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api-keys` | List all API keys for user |
| POST | `/api-keys` | Create a new API key |
| GET | `/api-keys/:id` | Get API key details |
| PATCH | `/api-keys/:id` | Update API key (name, permissions) |
| DELETE | `/api-keys/:id` | Revoke/delete API key |
| POST | `/api-keys/:id/rotate` | Rotate API key (regenerate) |

### Subscription/Tier Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tiers` | List all available tiers |
| GET | `/tiers/:id` | Get tier details |
| GET | `/subscriptions/current` | Get current user subscription |
| POST | `/subscriptions/upgrade` | Upgrade to a new tier |
| POST | `/subscriptions/downgrade` | Downgrade tier |
| POST | `/subscriptions/cancel` | Cancel subscription |
| POST | `/subscriptions/resume` | Resume canceled subscription |
| GET | `/subscriptions/usage` | Get current usage vs limits |

### Billing Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/billing/checkout` | Create checkout session |
| POST | `/billing/portal` | Get billing portal URL |
| GET | `/billing/invoices` | List invoices |
| GET | `/billing/invoices/:id` | Get invoice details |
| POST | `/billing/webhooks/stripe` | Stripe webhook handler |
| POST | `/billing/webhooks/paypal` | PayPal webhook handler |
| POST | `/billing/webhooks/lemonsqueezy` | LemonSqueezy webhook handler |

---

## Phase 4: Implementation Order

1. **Database Migration** - Add new tables to Prisma schema
2. **API Keys Module** - Full implementation
3. **Tiers Setup** - Create tier entities and seed data
4. **Subscription Module** - Subscription management
5. **Billing Module** - Payment provider integrations
6. **Feature Gating** - Guards and decorators
7. **Postman & Docs** - Update Swagger and regenerate collection

---

## Phase 5: Environment Variables

```env
# Payment Providers
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
PAYPAL_MODE=sandbox  # or 'live'

LEMONSQUEEZY_API_KEY=...
LEMONSQUEEZY_STORE_ID=...
LEMONSQUEEZY_WEBHOOK_SECRET=...

# Tier Configuration
DEFAULT_FREE_TIER_ID=...
```

---

## Tier Limits Configuration

```json
{
  "free": {
    "projects": 5,
    "apiKeys": 1,
    "apiCallsPerMonth": 1000,
    "syncFrequency": "daily",
    "aiEnrichment": false,
    "webhooks": 1,
    "teamMembers": 0,
    "support": "community"
  },
  "pro": {
    "projects": 50,
    "apiKeys": 5,
    "apiCallsPerMonth": 50000,
    "syncFrequency": "hourly",
    "aiEnrichment": true,
    "webhooks": 10,
    "teamMembers": 5,
    "support": "email"
  },
  "enterprise": {
    "projects": -1,  // unlimited
    "apiKeys": -1,
    "apiCallsPerMonth": -1,
    "syncFrequency": "realtime",
    "aiEnrichment": true,
    "webhooks": -1,
    "teamMembers": -1,
    "support": "priority"
  }
}
```
