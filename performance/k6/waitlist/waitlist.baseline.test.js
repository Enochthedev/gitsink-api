import http from 'k6/http';
import { check, sleep } from 'k6';
import { report } from '../../utils/report.js'; // 👈 update path if needed

const BASE_URL = __ENV.BASE_URL;
if (!BASE_URL) {
  throw new Error('❌ BASE_URL is not set.');
}

// 🐢 Light traffic: 5 users over 30s
export const options = {
  vus: 5,
  duration: '30s',
};

export default function () {
  const payload = JSON.stringify({
    email: `test${Math.floor(Math.random() * 100000)}@example.com`,
  });

  const headers = { 'Content-Type': 'application/json' };

  const res = http.post(`${BASE_URL}/waitlist`, payload, {
    headers,
    tags: { name: 'WaitlistJoinBaseline' },
  });

  check(res, {
    'status is 201 or 429': (r) => r.status === 201 || r.status === 429,
    'joined true if 201': (r) =>
      r.status !== 201 || (r.json().joined === true),
    'throttle msg if 429': (r) =>
      r.status !== 429 || r.body.includes('Too many requests'),
  });

  sleep(0.25); // gentle pacing
}

// 📦 Custom report using the shared utility
export const handleSummary = report('waitlist', 'waitlist-baseline');