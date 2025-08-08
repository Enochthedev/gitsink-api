import { SetMetadata } from '@nestjs/common';

export const METRICS_KEY = 'metrics';

export interface MetricsOptions {
  route?: string;
  operation?: string;
  track?: boolean;
}

export const Metrics = (options: MetricsOptions = {}) =>
  SetMetadata(METRICS_KEY, { track: true, ...options });
