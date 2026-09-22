import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { RepositoryProvider } from '../interfaces/repository-provider.interface';
import {
  AuthResult,
  PlatformApiResponse,
  PlatformCredentials,
  PlatformRateLimit,
  PlatformType,
  Repository,
  RepositoryContent,
  WebhookResult,
} from '../types/platform.types';

@Injectable()
export abstract class BaseRepositoryProvider implements RepositoryProvider {
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly httpClient: AxiosInstance;

  abstract readonly name: PlatformType;
  abstract readonly apiBaseUrl: string;
  abstract readonly webhookEvents: string[];

  constructor(protected readonly config: ConfigService) {
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Gitsink/1.0',
        Accept: 'application/json',
      },
    });

    // Add request interceptor for logging
    this.httpClient.interceptors.request.use(
      config => {
        this.logger.debug(`Making ${config.method?.toUpperCase()} request to ${config.url}`);
        return config;
      },
      error => {
        this.logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      },
    );

    // Add response interceptor for error handling and rate limit tracking
    this.httpClient.interceptors.response.use(
      response => {
        this.logger.debug(`Received ${response.status} response from ${response.config.url}`);
        return response;
      },
      error => {
        if (error.response) {
          this.logger.error(
            `API Error: ${error.response.status} - ${error.response.statusText}`,
            error.response.data,
          );
        } else if (error.request) {
          this.logger.error(
            'Network Error:',
            error instanceof Error ? error.message : String(error),
          );
        } else {
          this.logger.error(
            'Request Setup Error:',
            error instanceof Error ? error.message : String(error),
          );
        }
        return Promise.reject(error);
      },
    );
  }

  abstract authenticate(credentials: PlatformCredentials): Promise<AuthResult>;

  abstract fetchRepositories(
    credentials: PlatformCredentials,
    options?: any,
  ): Promise<PlatformApiResponse<Repository[]>>;

  abstract fetchRepository(
    credentials: PlatformCredentials,
    owner: string,
    repo: string,
  ): Promise<PlatformApiResponse<Repository>>;

  abstract fetchFileContent(
    credentials: PlatformCredentials,
    owner: string,
    repo: string,
    path: string,
    branch?: string,
  ): Promise<PlatformApiResponse<RepositoryContent>>;

  abstract setupWebhook(
    credentials: PlatformCredentials,
    owner: string,
    repo: string,
    webhookUrl: string,
    events?: string[],
  ): Promise<WebhookResult>;

  abstract removeWebhook(
    credentials: PlatformCredentials,
    owner: string,
    repo: string,
    webhookId: string,
  ): Promise<boolean>;

  abstract validateWebhookSignature(payload: string, signature: string, secret: string): boolean;

  abstract parseRepositoryUrl(url: string): { owner: string; repo: string } | null;

  abstract isValidUrl(url: string): boolean;

  abstract getAuthorizationUrl(
    clientId: string,
    redirectUri: string,
    scopes: string[],
    state?: string,
  ): string;

  abstract exchangeCodeForToken(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string,
  ): Promise<PlatformCredentials>;

  abstract refreshAccessToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
  ): Promise<PlatformCredentials>;

  async fetchPortfolioFile(
    credentials: PlatformCredentials,
    owner: string,
    repo: string,
    branch?: string,
  ): Promise<PlatformApiResponse<string | null>> {
    try {
      const response = await this.fetchFileContent(
        credentials,
        owner,
        repo,
        'Portfolio.md',
        branch,
      );

      if (response.data.encoding === 'base64') {
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        return {
          data: content,
          rateLimit: response.rateLimit,
          headers: response.headers,
        };
      }

      return {
        data: response.data.content,
        rateLimit: response.rateLimit,
        headers: response.headers,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        this.logger.debug(`Portfolio.md not found in ${owner}/${repo}`);
        return {
          data: null,
          rateLimit: this.extractRateLimit(error.response),
        };
      }
      throw error;
    }
  }

  protected createAuthHeaders(credentials: PlatformCredentials): Record<string, string> {
    return {
      Authorization: `Bearer ${credentials.accessToken}`,
    };
  }

  protected async makeAuthenticatedRequest<T>(
    credentials: PlatformCredentials,
    config: AxiosRequestConfig,
  ): Promise<PlatformApiResponse<T>> {
    const headers = {
      ...config.headers,
      ...this.createAuthHeaders(credentials),
    };

    const response = await this.httpClient.request<T>({
      ...config,
      headers,
    });

    return {
      data: response.data,
      rateLimit: this.extractRateLimit(response),
      headers: this.extractHeaders(response),
    };
  }

  protected extractRateLimit(response: AxiosResponse): PlatformRateLimit | undefined {
    // Default implementation - platforms can override
    const limit = response.headers['x-ratelimit-limit'];
    const remaining = response.headers['x-ratelimit-remaining'];
    const reset = response.headers['x-ratelimit-reset'];

    if (limit && remaining && reset) {
      return {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        resetAt: new Date(parseInt(reset, 10) * 1000),
      };
    }

    return undefined;
  }

  protected extractHeaders(response: AxiosResponse): Record<string, string> {
    return {
      'x-request-id': response.headers['x-request-id'] || '',
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'] || '',
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'] || '',
      'x-ratelimit-reset': response.headers['x-ratelimit-reset'] || '',
    };
  }

  protected handleApiError(error: any, context: string): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message || error instanceof Error ? error.message : String(error);

      this.logger.error(`${context} failed: ${status} - ${message}`);

      switch (status) {
        case 401:
          throw new Error(`Authentication failed: ${message}`);
        case 403:
          throw new Error(`Access forbidden: ${message}`);
        case 404:
          throw new Error(`Resource not found: ${message}`);
        case 422:
          throw new Error(`Validation error: ${message}`);
        case 429:
          throw new Error(`Rate limit exceeded: ${message}`);
        default:
          throw new Error(`API error: ${message}`);
      }
    }

    this.logger.error(`${context} failed with unexpected error:`, error);
    throw new Error(
      `Unexpected error: ${error instanceof Error ? error.message : String(error) || 'Unknown error'}`,
    );
  }
}
