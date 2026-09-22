import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum PaymentProvider {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
  LEMONSQUEEZY = 'lemonsqueezy',
}

export enum PaymentStatus {
  SUCCEEDED = 'succeeded',
  PENDING = 'pending',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
}

// ============ Checkout DTOs ============

export class CreateCheckoutDto {
  @ApiProperty({ example: 'pro', description: 'Tier name to subscribe to' })
  @IsString()
  tierName!: string;

  @ApiProperty({ example: 'stripe', enum: PaymentProvider })
  @IsEnum(PaymentProvider)
  provider!: PaymentProvider;

  @ApiPropertyOptional({ example: 'monthly', description: 'Billing cycle' })
  @IsOptional()
  @IsString()
  billingCycle?: 'monthly' | 'yearly';

  @ApiPropertyOptional({ example: 'https://app.gitsink.dev/billing/success' })
  @IsOptional()
  @IsString()
  successUrl?: string;

  @ApiPropertyOptional({ example: 'https://app.gitsink.dev/billing/cancel' })
  @IsOptional()
  @IsString()
  cancelUrl?: string;
}

export class CheckoutResponseDto {
  @ApiProperty({ example: 'https://checkout.stripe.com/c/pay/...' })
  checkoutUrl!: string;

  @ApiProperty({ example: 'cs_test_abc123' })
  sessionId!: string;

  @ApiProperty({ example: 'stripe' })
  provider!: string;

  @ApiPropertyOptional({ example: '2024-01-15T10:30:00.000Z' })
  expiresAt?: Date;
}

export class BillingPortalResponseDto {
  @ApiProperty({ example: 'https://billing.stripe.com/p/session/...' })
  portalUrl!: string;

  @ApiPropertyOptional({ example: '2024-01-15T10:30:00.000Z' })
  expiresAt?: Date;
}

// ============ Payment DTOs ============

export class PaymentResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 19.99 })
  amount!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: 'succeeded', enum: PaymentStatus })
  status!: string;

  @ApiProperty({ example: 'subscription' })
  type!: string;

  @ApiProperty({ example: 'stripe' })
  paymentProvider!: string;

  @ApiPropertyOptional({ example: 'https://invoice.stripe.com/i/...' })
  invoiceUrl?: string;

  @ApiPropertyOptional({ example: 'https://pay.stripe.com/receipts/...' })
  receiptUrl?: string;

  @ApiPropertyOptional({ example: 'Pro Plan - Monthly' })
  description?: string;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  paidAt?: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt!: Date;
}

export class InvoiceResponseDto {
  @ApiProperty({ example: 'in_1234567890' })
  id!: string;

  @ApiProperty({ example: 19.99 })
  amount!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: 'paid' })
  status!: string;

  @ApiProperty({ example: 'https://invoice.stripe.com/i/...' })
  invoiceUrl!: string;

  @ApiPropertyOptional({ example: 'https://invoice.stripe.com/i/.../pdf' })
  pdfUrl?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  periodStart!: Date;

  @ApiProperty({ example: '2024-02-01T00:00:00.000Z' })
  periodEnd!: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt!: Date;
}

// ============ Refund DTOs ============

export class CreateRefundDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsString()
  paymentId!: string;

  @ApiPropertyOptional({
    example: 10.0,
    description: 'Partial refund amount (omit for full refund)',
  })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: 'Customer request' })
  @IsOptional()
  @IsString()
  reason?: string;
}
