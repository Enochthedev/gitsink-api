import http from 'k6/http';
import { check } from 'k6';
import { report } from '../../utils/report.js';

const BASE_URL = __ENV.BASE_URL;
if (!BASE_URL) throw new Error('❌ BASE_URL is not set.');

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '10s', target: 20 },
    { duration: '10s', target: 40 },
    { duration: '10s', target: 60 },
    { duration: '10s', target: 80 },
    { duration: '10s', target: 100 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.1'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  const payload = JSON.stringify({
    email: `load_${Math.floor(Math.random() * 100000)}@example.com`,
  });

  const headers = { 'Content-Type': 'application/json' };

  const res = http.post(`${BASE_URL}/waitlist`, payload, { headers });

  check(res, {
    'status is 201 or 429': (r) => r.status === 201 || r.status === 429,
  });
}

export const handleSummary = report('waitlist', 'waitlist-load');