import http from 'k6/http';
import { check } from 'k6';
import { report } from '../../utils/report.js';

const BASE_URL = __ENV.BASE_URL;
if (!BASE_URL) throw new Error('❌ BASE_URL is not set.');

export const options = {
  stages: [
    { duration: '5s', target: 0 },
    { duration: '2s', target: 50 },   // sudden spike
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests should be < 1s
    http_req_failed: ['rate<0.1'],     // <10% errors
  },
};

export default function () {
  const payload = JSON.stringify({
    email: `spike_${Math.floor(Math.random() * 100000)}@example.com`,
  });

  const headers = { 'Content-Type': 'application/json' };

  const res = http.post(`${BASE_URL}/waitlist`, payload, { headers });

  check(res, {
    'status is 201 or 429': (r) => r.status === 201 || r.status === 429,
    'joined is true (if not throttled)': (r) =>
      r.status === 201 ? r.json().joined === true : true,
  });
}

export const handleSummary = report('waitlist', 'waitlist-spike');