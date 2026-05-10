#!/usr/bin/env node
/**
 * Horizontal Scaling - Load Balancing Test
 * 
 * Usage: node scripts/test-horizontal-scaling.js [API_URL]
 */

const https = require('https');
const http = require('http');

const API_URL = process.argv[2] || process.env.BACKEND_URL || 'http://localhost:5000';
const REQUEST_COUNT = 10;

// Colors
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const startTime = Date.now();
    
    const req = client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            body: JSON.parse(data),
            responseTime: Date.now() - startTime,
          });
        } catch (e) {
          resolve({ body: {}, responseTime: Date.now() - startTime });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function main() {
  console.log(`\n${c.bright}${c.cyan}🔄 Load Balancing Test - ${REQUEST_COUNT} requests${c.reset}\n`);
  console.log(`   Target: ${API_URL}/health\n`);
  
  const instances = new Map();
  let successCount = 0;
  
  for (let i = 0; i < REQUEST_COUNT; i++) {
    try {
      const result = await makeRequest(`${API_URL}/health`);
      const instanceId = result.body.instance || 'unknown';
      instances.set(instanceId, (instances.get(instanceId) || 0) + 1);
      successCount++;
      console.log(`   ${c.green}✓${c.reset} Request ${i + 1}: ${instanceId.substring(0, 35)} (${result.responseTime}ms)`);
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.log(`   ${c.red}✗${c.reset} Request ${i + 1}: FAILED - ${error.message}`);
    }
  }
  
  // Results
  console.log(`\n${c.bright}📊 Instance Distribution:${c.reset}`);
  console.log('   ' + '─'.repeat(50));
  
  [...instances.entries()].forEach(([id, count]) => {
    const pct = Math.round(count / successCount * 100);
    const bar = '█'.repeat(Math.round(pct / 5));
    console.log(`   ${id.substring(0, 30).padEnd(30)} │ ${count.toString().padStart(2)} │ ${pct.toString().padStart(3)}% ${bar}`);
  });
  
  console.log('   ' + '─'.repeat(50));
  console.log(`   ${c.bright}Total: ${successCount}/${REQUEST_COUNT} successful${c.reset}`);
  console.log(`   ${c.bright}Unique instances: ${instances.size}${c.reset}\n`);
}

main().catch(console.error);
