import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  vus: 20,
  duration: '20s',
};

export default function () {
  const payload = JSON.stringify({
    email: `test${Math.floor(Math.random() * 100000)}@example.com`,
  });

  const headers = { 'Content-Type': 'application/json' };

  const res = http.post(`${BASE_URL}/waitlist`, payload, {
    headers,
    tags: { name: 'WaitlistJoin' },
  });

  check(res, {
    'status is 201': (r) => r.status === 201 || r.status === 429,
    'joined is true when not throttled': (r) =>
      r.status === 201 ? r.json().joined === true : true,
    'is throttled if 429': (r) =>
      r.status !== 429 || r.body.includes('Too many requests'),
  });


  sleep(0.05);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'waitlist-load.json': JSON.stringify(data, null, 2),
  };
}
