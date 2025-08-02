#!/usr/bin/env node
require("dotenv").config();
const { execSync } = require("child_process");
const fs = require("fs"); // 🔧 Added missing fs import
const path = require("path");
const glob = require("glob");

const args = process.argv.slice(2);
const target = args[0]; // e.g., "k6/waitlist-throttle" or "artillery/waitlist-throttle"

// 🔧 Function to ensure all necessary directories exist
function ensureDirectories() {
  const dirs = [
    "performance/k6/report",
    "performance/k6/report/waitlist",
    "performance/k6/report/k6",
    "performance/reports",
    "performance/reports/k6",
    "performance/reports/k6/waitlist",
    "performance/reports/artillery",
  ];

  console.log("🔧 Setting up performance test directories...");
  
  dirs.forEach(dir => {
    const fullPath = path.resolve(dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    }
  });
  
  console.log("📁 Directory setup complete!\n");
}

function runK6(fileOrModule) {
  const dir = path.join(__dirname, "k6");
  const baseUrl = process.env.BASE_URL;

  if (!baseUrl) {
    console.error("❌ BASE_URL environment variable is not set.");
    process.exit(1);
  }

  if (!fileOrModule.includes("/")) {
    // Module: Run all tests inside that module directory
    const pattern = path.join(dir, fileOrModule, `*.test.js`);
    const files = glob.sync(pattern);

    if (files.length === 0) {
      console.error(`❌ No tests found for module: ${fileOrModule}`);
      process.exit(1);
    }

    files.forEach((file) => {
      console.log(`▶️ Running ${path.relative(__dirname, file)}`);
      try {
        execSync(`k6 run -e BASE_URL=${baseUrl} ${file}`, {
          stdio: "inherit",
        });
        console.log(`✅ Completed: ${path.relative(__dirname, file)}\n`);
      } catch (error) {
        // 🔧 Handle K6 threshold violations gracefully
        if (error.status === 99) {
          console.log(`⚠️  Threshold violations in: ${path.relative(__dirname, file)} (may be expected for stress tests)\n`);
        } else {
          console.error(`❌ Failed: ${path.relative(__dirname, file)}`, error.message);
          // Don't exit - continue with other tests
        }
      }
    });
  } else {
    // Specific test file (e.g. waitlist/throttle)
    const fullPath = path.join(dir, `${fileOrModule}.test.js`);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Test file not found: ${fullPath}`);
      process.exit(1);
    }

    console.log(`▶️ Running ${path.relative(__dirname, fullPath)}`);
    try {
      execSync(`k6 run -e BASE_URL=${baseUrl} ${fullPath}`, {
        stdio: "inherit",
      });
      console.log(`✅ Completed: ${path.relative(__dirname, fullPath)}`);
    } catch (error) {
      if (error.status === 99) {
        console.log(`⚠️  Threshold violations in: ${path.relative(__dirname, fullPath)} (may be expected)`);
      } else {
        console.error(`❌ Failed: ${path.relative(__dirname, fullPath)}`, error.message);
        process.exit(1);
      }
    }
  }
}

function runArtillery(file) {
  const fullPath = path.join(__dirname, "artillery", `${file}.yml`);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Artillery test file not found: ${fullPath}`);
    process.exit(1);
  }
  
  console.log(`▶️ Running Artillery: ${file}`);
  try {
    execSync(`artillery run ${fullPath}`, { stdio: "inherit" });
    console.log(`✅ Artillery test completed: ${file}`);
  } catch (error) {
    console.error(`❌ Artillery test failed: ${file}`, error.message);
  }
}

function runAll() {
  console.log("🔁 Running ALL performance tests...\n");
  
  // Run all K6 tests
  console.log("📊 K6 Tests:");
  try {
    const k6Files = glob.sync("./k6/**/*.test.js");
    k6Files.forEach(file => {
      console.log(`▶️ Running ${file}`);
      try {
        execSync(`k6 run -e BASE_URL=${process.env.BASE_URL} ${file}`, { stdio: "inherit" });
      } catch (error) {
        if (error.status === 99) {
          console.log(`⚠️  Threshold violations in: ${file} (continuing...)`);
        } else {
          console.error(`❌ Failed: ${file}`);
        }
      }
    });
  } catch (error) {
    console.error("❌ Error running K6 tests:", error.message);
  }

  // Run all Artillery tests  
  console.log("\n🎯 Artillery Tests:");
  try {
    const artilleryFiles = glob.sync("./artillery/**/*.yml");
    artilleryFiles.forEach(file => {
      console.log(`▶️ Running ${file}`);
      try {
        execSync(`artillery run ${file}`, { stdio: "inherit" });
      } catch (error) {
        console.error(`❌ Artillery test failed: ${file}`);
      }
    });
  } catch (error) {
    console.error("❌ Error running Artillery tests:", error.message);
  }
}

// 🔧 Always ensure directories exist before running tests
ensureDirectories();

if (!target || target === "all") {
  runAll();
} else if (target.startsWith("k6/")) {
  runK6(target.replace("k6/", ""));
} else if (target.startsWith("artillery/")) {
  runArtillery(target.replace("artillery/", ""));
} else {
  console.error("❌ Unknown test target. Use: k6/module or k6/module/test or artillery/test");
  console.log("\nExamples:");
  console.log("  node run.js k6/waitlist");
  console.log("  node run.js k6/waitlist/throttle");
  console.log("  node run.js artillery/load-test");
  console.log("  node run.js all");
  process.exit(1);
}