import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import { BillingService } from './billing.service';
import {
  BillingPortalResponseDto,
  CheckoutResponseDto,
  CreateCheckoutDto,
  InvoiceResponseDto,
  PaymentResponseDto,
} from './dto/billing.dto';

interface RequestWithUser extends Request {
  user: { id: string; email: string };
}

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // ============ AUTHENTICATED ENDPOINTS ============

  @Post('checkout')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create checkout session',
    description: 'Create a checkout session to subscribe to a paid tier',
  })
  @ApiResponse({ status: 200, description: 'Checkout session created', type: CheckoutResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid tier or provider' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createCheckout(
    @Req() req: RequestWithUser,
    @Body() dto: CreateCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    return this.billingService.createCheckout(req.user.id, dto);
  }

  @Post('portal')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create billing portal session',
    description: 'Get a URL to manage subscription, update payment method, view invoices',
  })
  @ApiQuery({
    name: 'provider',
    required: false,
    description: 'Payment provider (default: stripe)',
  })
  @ApiResponse({ status: 200, description: 'Portal URL generated', type: BillingPortalResponseDto })
  @ApiResponse({ status: 400, description: 'No active subscription' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createPortalSession(
    @Req() req: RequestWithUser,
    @Query('provider') provider: string = 'stripe',
  ): Promise<BillingPortalResponseDto> {
    return this.billingService.createPortalSession(req.user.id, provider);
  }

  @Get('payments')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get payment history',
    description: 'List all payments made by the user',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of payments to return' })
  @ApiResponse({ status: 200, description: 'Payment history', type: [PaymentResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPayments(
    @Req() req: RequestWithUser,
    @Query('limit') limit: number = 20,
  ): Promise<PaymentResponseDto[]> {
    return this.billingService.getPayments(req.user.id, limit);
  }

  @Get('invoices')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get invoices', description: 'List all invoices for the user' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of invoices to return' })
  @ApiResponse({ status: 200, description: 'Invoice list', type: [InvoiceResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getInvoices(
    @Req() req: RequestWithUser,
    @Query('limit') limit: number = 20,
  ): Promise<InvoiceResponseDto[]> {
    return this.billingService.getInvoices(req.user.id, limit);
  }

  // ============ WEBHOOK ENDPOINTS (No Auth) ============

  @Post('webhooks/stripe')
  @ApiOperation({ summary: 'Stripe webhook handler', description: 'Handle Stripe webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 400, description: 'Invalid signature' })
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new Error('Raw body not available');
    }
    return this.billingService.handleWebhook('stripe', rawBody, signature);
  }

  @Post('webhooks/paypal')
  @ApiOperation({ summary: 'PayPal webhook handler', description: 'Handle PayPal webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 400, description: 'Invalid signature' })
  async handlePayPalWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('paypal-transmission-sig') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new Error('Raw body not available');
    }
    return this.billingService.handleWebhook('paypal', rawBody, signature);
  }

  @Post('webhooks/lemonsqueezy')
  @ApiOperation({
    summary: 'LemonSqueezy webhook handler',
    description: 'Handle LemonSqueezy webhook events',
  })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 400, description: 'Invalid signature' })
  async handleLemonSqueezyWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new Error('Raw body not available');
    }
    return this.billingService.handleWebhook('lemonsqueezy', rawBody, signature);
  }
}
