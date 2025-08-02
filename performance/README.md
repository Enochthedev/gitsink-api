# 📊 Performance Testing Suite – performance/

This directory contains performance, stress, throttle, and soak tests for the entire Gitsink API using K6 and Artillery. It supports modular, per-endpoint test organization, centralized execution, environment-based configs, and reporting in JSON and Markdown.
📊 Performance Testing Suite – performance/

This directory contains performance, stress, throttle, and soak tests for the entire Gitsink API using K6 and Artillery. It supports modular, per-endpoint test organization, centralized execution, environment-based configs, and reporting in JSON and Markdown.

``` bash
performance/
├── k6/                            # K6-based test scripts
│   └── waitlist/
│       ├── waitlist-throttle.js   # Main throttle/load test
│       ├── waitlist-spike.js      # Optional spike test
│       └── ...
├── artillery/                     # Artillery-based tests (YAML)
│   └── waitlist/
│       └── waitlist-load.yml
├── utils/
│   └── report.js                  # Shared reporting logic
├── reports/                       # Test output logs
│   ├── k6/
│   │   └── waitlist/
│   │       └── waitlist-throttle.json
│   └── artillery/
│       └── ...
├── run.js                         # CLI to run tests modularly
└── .env                           # Contains BASE_URL, etc.
```

## 🧪 Supported Test Types

Each endpoint/module can have one or more of the following test types:

- **Load Tests**: Sustained request volume for 10–30s.
- **Spike Tests**: Sharp traffic surge in short time.
- **Soak Tests**: Long-term traffic over 5–60 minutes.
- **Throttling Tests**: Verifies rate-limiting, returns 429 on burst.
- **Stress Tests**: Pushes the service to breaking point.
- **Concurrency Tests**: Floods server with many concurrent users.
- **Baseline Tests**: Low-load smoke test for quick checks.

## ✅ Waitlist Module Tests

- **Throttle Test**: `performance/k6/waitlist/waitlist-throttle.js`
  - Simulates 1000 users with 10 RPS, checks for 429 responses.

🚀 How to Run Tests

1. Set Base URL

   In your root .env file:

    ```bash
    BASE_URL=http://localhost:3000
    ```

2. Available Scripts (package.json)

    ```bash
    "test:perf": "node performance/run.js",
    "test:perf:all": "node performance/run.js all",
    "test:perf:k6": "node performance/run.js k6/waitlist-throttle",
    "test:perf:artillery": "node performance/run.js artillery/waitlist-throttle"
    ```

    Run a specific test:

    ```bash
    npm run test:perf:k6
    ```

    Run all tests:

    ```bash
    npm run test:perf:all
    ```

3. View Test Reports

After running tests, view the reports in the `performance/reports/` directory.

## 🛠 run.js CLI Tool

Discovers and runs any test in performance/k6/ or performance/artillery/
 • Automatically outputs report to performance/reports/{tool}/{module}/{test-name}.json
 • Uses execSync for shell-level performance execution

## 📁 Reports & Output

All test runs produce:
 • stdout: visual CLI summary
 • .json: raw result (for dashboards or CI pipelines)
 • (Optional): Markdown / HTML logs (can be added later)

Sample structure:

```bash
performance/
└── reports/
    └── k6/
        └── waitlist/
            ├── waitlist-throttle.json
            └── waitlist-throttle.md *(planned)*
```

## 🧩 Utilities

utils/report.js

- Shared logic for generating reports in JSON and Markdown formats.

```bash
report(module: string, testName: string)
```

 Creates a summary output and ensures reports are saved in:

 ```bash
 performance/reports/k6/<module>/<test>.json
 ```

## 📊 Grafana / CI Integration (Planned)

 • Output .json files are structured and ready for parsing
 • Future: feed them into InfluxDB or Prometheus using K6 output adapters
 • Example:
 • Request latency
 • Success rate
 • Throttle ratio
 • VUs (Virtual Users)

## 📌 TODO

 • Add soak tests per critical module
 • Add auth module tests
 • Generate HTML/Markdown per-test summaries
 • Integrate report.js for Artillery logs
 • CI pipeline to run tests on staging push
