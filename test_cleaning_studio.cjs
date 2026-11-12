const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('--- Testing DataLens Cleaning Studio Integration ---');

  // 1. Register test user
  const email = `cleaner_${Date.now()}@test.com`;
  const regRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    fullName: 'Cleaning Studio Tester',
    email,
    password: 'Password123!',
    confirmPassword: 'Password123!'
  });

  console.log('1. Registration status:', regRes.status, regRes.body.success ? 'SUCCESS' : 'FAILED');

  // Login
  const loginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email,
    password: 'Password123!'
  });

  console.log('   Login status:', loginRes.status, loginRes.body.success ? 'SUCCESS' : 'FAILED');
  const token = loginRes.body.token || loginRes.body.sessionId || 'test-token';
  const cookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0] : '';
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'X-Session-ID': token,
    'Cookie': cookie,
    'Content-Type': 'application/json'
  };

  // 2. Load DEMO_DATAPILOT.csv sample
  const sampleRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/sample-data?sample=datapilot&sid=${token}`,
    method: 'GET',
    headers: authHeaders
  });

  console.log('2. Loaded DEMO_DATAPILOT.csv:', sampleRes.body.success);
  console.log('   Dataset Name:', sampleRes.body.datasetName);
  console.log('   Row Count:', sampleRes.body.rowCount, '(Expected: 31)');
  console.log('   Col Count:', sampleRes.body.columnCount, '(Expected: 13)');
  if (sampleRes.body.rowCount !== 31 || sampleRes.body.columnCount !== 13) {
    throw new Error(`Expected 31 rows and 13 columns, got ${sampleRes.body.rowCount} rows, ${sampleRes.body.columnCount} cols`);
  }

  // 3. Stage multi-step cleaning pipeline:
  // Step 1: Remove exact duplicates
  // Step 2: Trim whitespace in all text columns
  // Step 3: Text sanitize (remove special characters) in Customer_Name
  // Step 4: Impute missing in Unit_Price with mean
  // Step 5: Cap outliers in Unit_Price
  // Step 6: Rename Delivery_Days to Shipping_Days
  const stagedOps = [
    { type: 'REMOVE_DUPLICATES', strategy: 'remove_exact', column: 'ALL', description: 'Remove exact duplicate rows' },
    { type: 'TEXT_SANITIZE', strategy: 'trim', column: 'ALL', description: 'Trim whitespace across all columns' },
    { type: 'TEXT_SANITIZE', strategy: 'remove_special', column: 'Customer_Name', description: 'Remove special characters in Customer_Name' },
    { type: 'MISSING_VALUES', strategy: 'impute_mean', column: 'Unit_Price', description: 'Impute missing in Unit_Price with Mean' },
    { type: 'OUTLIERS', strategy: 'cap_iqr', column: 'Unit_Price', description: 'Cap outliers in Unit_Price to 1.5x IQR' },
    { type: 'COLUMN_MANAGEMENT', action: 'rename', column: 'Delivery_Days', newColumnName: 'Shipping_Days', description: 'Rename Delivery_Days to Shipping_Days' }
  ];

  // 4. Test Preview Endpoint
  const previewRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/cleaning/preview?sid=${token}`,
    method: 'POST',
    headers: authHeaders
  }, { operations: stagedOps });

  console.log('3. Preview status:', previewRes.status, previewRes.body.success ? 'SUCCESS' : 'FAILED');
  const pData = previewRes.body;
  console.log('   Original Rows:', pData.originalRowCount, '-> Cleaned Rows:', pData.cleanedRowCount);
  console.log('   Original Cols:', pData.originalColumnCount, '-> Cleaned Cols:', pData.cleanedColumnCount);
  console.log('   Affected Rows:', pData.affectedRowsCount);
  console.log('   Affected Cells:', pData.affectedCellsCount);
  console.log('   Changed Cells Count:', pData.changedCells ? pData.changedCells.length : 0);
  console.log('   Summary:', pData.summary);

  // Verify headers and transformed rows
  console.log('   Headers:', pData.headers);
  if (!pData.headers.includes('Shipping_Days')) {
    throw new Error("Expected renamed column 'Shipping_Days' in headers!");
  }
  if (pData.headers.includes('Delivery_Days')) {
    throw new Error("Column 'Delivery_Days' should have been renamed!");
  }

  // Verify rows are non-empty and every cell contains actual string values
  if (!pData.rows || pData.rows.length === 0) {
    throw new Error("Expected preview rows to be non-empty!");
  }
  let emptyCellCount = 0;
  for (let r = 0; r < pData.rows.length; r++) {
    const row = pData.rows[r];
    if (row.length !== pData.headers.length) {
      throw new Error(`Row ${r} length ${row.length} does not match headers length ${pData.headers.length}`);
    }
  }
  console.log(`   Verified all ${pData.rows.length} rows and ${pData.headers.length} columns have valid cells!`);

  // Verify that modified cells exist and diff map contains details
  console.log('   Sample Cell Changes:', Object.entries(pData.cellChanges || {}).slice(0, 3));
  if (!pData.changedCells || pData.changedCells.length === 0) {
    throw new Error("Expected changedCells to be non-empty after transformations!");
  }

  // 5. Test Apply Endpoint (Save as new version)
  const applyRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/cleaning/apply?sid=${token}`,
    method: 'POST',
    headers: authHeaders
  }, {
    operations: stagedOps,
    versionName: 'DEMO_DATAPILOT_v2_Cleaned.csv'
  });

  console.log('4. Apply status:', applyRes.status, applyRes.body.success ? 'SUCCESS' : 'FAILED');
  console.log('   New Dataset ID:', applyRes.body.newDatasetId);
  console.log('   New Version Name:', applyRes.body.newVersionName);
  console.log('   New Quality Score:', applyRes.body.newQualityScore);

  // 6. Test Download Cleaned CSV Endpoint
  const downloadRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/cleaning/download?sid=${token}`,
    method: 'POST',
    headers: authHeaders
  }, { operations: stagedOps });

  console.log('5. Download Cleaned CSV status:', downloadRes.status);
  const csvText = typeof downloadRes.body === 'string' ? downloadRes.body : JSON.stringify(downloadRes.body);
  console.log('   Downloaded CSV size:', csvText.length, 'bytes');
  console.log('   First line of CSV:', csvText.split('\n')[0]);
  if (!csvText.includes('Shipping_Days')) {
    throw new Error("Downloaded CSV should contain renamed 'Shipping_Days' header!");
  }

  console.log('--- ALL CLEANING STUDIO INTEGRATION TESTS PASSED! ---');
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
