import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

export function report(module, name, statusCodes = null) {
  const filepath = `performance/k6/report/${module}/${name}.json`;

  return function (data) {
    const summary = {
      ...data,
      statusCodes,
    };

    let throttleRate = '0.00';
    
    if (statusCodes) {
      const total = Object.values(statusCodes).reduce((a, b) => a + b, 0);
      throttleRate = total > 0 
        ? ((statusCodes['429'] / total) * 100).toFixed(2)
        : '0.00';

      console.log('\n📊 Status Code Summary:');
      console.log(`  ✅ 201 (Created): ${statusCodes['201']}`);
      console.log(`  ⛔ 429 (Throttled): ${statusCodes['429']}`);
      console.log(`  ❓ Other: ${statusCodes.other || statusCodes['other'] || 0}`);
      console.log(`  🚦 Throttle Rate: ${throttleRate}%`);
      console.log(`  📊 Total Requests: ${total}`);
    }

    const result = {
      stdout: textSummary(data, { indent: ' ', enableColors: true }),
    };

    // Only add file output if we have the directory
    try {
      result[filepath] = JSON.stringify(summary, null, 2);
    } catch (error) {
      console.warn(`⚠️  Could not save report to ${filepath}: ${error.message}`);
    }

    return result;
  };
}