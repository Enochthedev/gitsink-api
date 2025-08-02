import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { report } from '../../utils/report.js';

const BASE_URL = __ENV.BASE_URL;
if (!BASE_URL) throw new Error('❌ BASE_URL is not set.');

// Custom metrics for tracking
const successCounter = new Counter('stress_success');
const throttleCounter = new Counter('stress_throttle');

export const options = {
  stages: [
    { duration: '5s', target: 5 },
    { duration: '10s', target: 20 },
    { duration: '10s', target: 40 },
    { duration: '10s', target: 60 },
    { duration: '10s', target: 80 },
    { duration: '10s', target: 100 }, // ramp up
    { duration: '5s', target: 0 },    // ramp down
  ],
  thresholds: {
    // Adjust thresholds for stress testing with throttling
    http_req_duration: ['p(95)<5000'],    // 95% of requests < 5s (more realistic)
    // Don't fail on http_req_failed since throttling is expected in stress tests
    stress_success: ['count>100'],        // Expect at least some successes
    checks: ['rate>0.99'],                // 99% of checks should pass
  },
};

export default function () {
  const payload = JSON.stringify({
    email: `stress_${Date.now()}_${Math.floor(Math.random() * 100000)}@example.com`,
  });

  const headers = { 'Content-Type': 'application/json' };

  const res = http.post(`${BASE_URL}/waitlist`, payload, { headers });

  // Track success/throttle with custom metrics
  if (res.status === 201) {
    successCounter.add(1);
  } else if (res.status === 429) {
    throttleCounter.add(1);
  }

  check(res, {
    'status is 201 or 429': (r) => r.status === 201 || r.status === 429,
    'response time acceptable': (r) => r.timings.duration < 10000, // 10s max
  });
}

export function handleSummary(data) {
  const statusCodes = {
    '201': data.metrics.stress_success?.values?.count || 0,
    '429': data.metrics.stress_throttle?.values?.count || 0,
    'other': (data.metrics.http_reqs?.values?.count || 0) - 
             (data.metrics.stress_success?.values?.count || 0) - 
             (data.metrics.stress_throttle?.values?.count || 0),
  };

  return report('waitlist', 'waitlist-stress', statusCodes)(data);
}