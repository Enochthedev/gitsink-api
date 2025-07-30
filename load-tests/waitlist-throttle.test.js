import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '5s', target: 5 },   // Ramp up to 5 users
    { duration: '10s', target: 15 }, // Ramp up to 15 users  
    { duration: '5s', target: 0 },   // Ramp down
  ],
};

// Track response status codes
let statusCodes = {
  '200': 0,
  '201': 0, 
  '429': 0,
  'other': 0
};

export default function () {
  const payload = JSON.stringify({
    email: `test${Math.floor(Math.random() * 100000)}@example.com`,
  });

  const headers = { 'Content-Type': 'application/json' };

  const res = http.post(`${BASE_URL}/waitlist`, payload, { headers });
  
  // Track status codes
  if (statusCodes[res.status]) {
    statusCodes[res.status]++;
  } else {
    statusCodes['other']++;
  }

  // Log some throttled responses for debugging
  if (res.status === 429) {
    console.log(`🛑 Throttled: ${res.status} - ${res.body}`);
  }

  check(res, {
    'is 201 or 429': (r) => r.status === 201 || r.status === 429,
    'success response format': (r) => {
      if (r.status === 201) {
        try {
          const body = r.json();
          return body && body.joined === true;
        } catch (e) {
          return false;
        }
      }
      return true;
    },
    'throttle response format': (r) => {
      if (r.status === 429) {
        return r.body.includes('Too many requests') || r.body.includes('please slow down');
      }
      return true;
    },
  });

  // Very aggressive - no sleep to maximize request rate
  // This should definitely trigger throttling
}

export function handleSummary(data) {
  console.log('\n📊 Status Code Distribution:');
  console.log(`  201 (Success): ${statusCodes['201']}`);
  console.log(`  429 (Throttled): ${statusCodes['429']}`);
  console.log(`  Other: ${statusCodes['other']}`);
  
  const totalRequests = Object.values(statusCodes).reduce((a, b) => a + b, 0);
  const throttleRate = ((statusCodes['429'] / totalRequests) * 100).toFixed(2);
  console.log(`  Throttle Rate: ${throttleRate}%`);

  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'detailed-throttle-summary.json': JSON.stringify({
      ...data,
      statusCodes,
      throttleRate: `${throttleRate}%`
    }, null, 2),
  };
}