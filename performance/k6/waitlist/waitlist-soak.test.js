import http from 'k6/http';
import { check } from 'k6';
import { report } from '../../utils/report.js';

const BASE_URL = __ENV.BASE_URL;
if (!BASE_URL) throw new Error('❌ BASE_URL is not set.');

export const options = {
  vus: 10,
  duration: '2m', // Simulates sustained usage for 2 minutes
  thresholds: {
    http_req_failed: ['rate<0.05'],       // <5% failure
    http_req_duration: ['p(95)<1000'],    // 95% under 1s
  },
};

export default function () {
  const payload = JSON.stringify({
    email: `soak_${Math.floor(Math.random() * 100000)}@example.com`,
  });

  const headers = { 'Content-Type': 'application/json' };

  const res = http.post(`${BASE_URL}/waitlist`, payload, { headers });

  check(res, {
    'status is 201 or 429': (r) => r.status === 201 || r.status === 429,
  });
}

export const handleSummary = report('waitlist', 'waitlist-soak');