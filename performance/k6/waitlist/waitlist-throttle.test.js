import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { report } from '../../utils/report.js';

const BASE_URL = __ENV.BASE_URL;
if (!BASE_URL) throw new Error('❌ BASE_URL is not set.');

// Use K6 metrics instead of global variables
const successCounter = new Counter('status_201');
const throttleCounter = new Counter('status_429');
const otherCounter = new Counter('status_other');

export const options = {
  stages: [
    { duration: '5s', target: 5 },
    { duration: '10s', target: 15 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'], // Allow longer duration for throttling
    // Remove the failed request threshold since throttling is expected
  },
};

export default function () {
  const email = `test${Math.floor(Math.random() * 100000)}@example.com`;
  const payload = JSON.stringify({ email });
  const headers = { 'Content-Type': 'application/json' };

  const res = http.post(`${BASE_URL}/waitlist`, payload, {
    headers,
    tags: { name: 'WaitlistJoin' },
  });

  // Count responses using K6 metrics
  if (res.status === 201) {
    successCounter.add(1);
  } else if (res.status === 429) {
    throttleCounter.add(1);
    console.log(`🛑 Throttled: ${res.status} - Too many requests, please try again later.`);
  } else {
    otherCounter.add(1);
    console.log(`⚠️ Unexpected status: ${res.status} - ${res.body}`);
  }

  check(res, {
    'status is 201 or 429': (r) => r.status === 201 || r.status === 429,
    'joined true when not throttled': (r) =>
      r.status === 201 ? r.json().joined === true : true,
    'throttle message if 429': (r) =>
      r.status !== 429 || r.body.includes('Too many requests'),
  });

  sleep(0.05);
}

export function handleSummary(data) {
  // Extract counts from the metrics
  const statusCodes = {
    '201': data.metrics.status_201?.values?.count || 0,
    '429': data.metrics.status_429?.values?.count || 0,
    'other': data.metrics.status_other?.values?.count || 0,
  };

  return report('waitlist', 'waitlist-throttle', statusCodes)(data);
}