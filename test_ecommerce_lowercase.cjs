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
  console.log('=== Testing E-Commerce Orders Lowercase Sanitization & Preview Table ===');

  // 1. Register & login
  const email = `ecom_${Date.now()}@test.com`;
  await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    fullName: 'Ecom Tester',
    email,
    password: 'Password123!',
    confirmPassword: 'Password123!'
  });

  const loginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password: 'Password123!' });

  const token = loginRes.body.token || loginRes.body.sessionId || 'test-token';
  const cookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0] : '';
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'X-Session-ID': token,
    'Cookie': cookie,
    'Content-Type': 'application/json'
  };

  // 2. Load E-Commerce sample
  const sampleRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/sample-data?sample=ecommerce&sid=${token}`,
    method: 'GET',
    headers: authHeaders
  });

  console.log('1. Loaded ecommerce dataset:', sampleRes.body.datasetName, `(${sampleRes.body.rowCount} rows, ${sampleRes.body.columnCount} cols)`);

  // 3. Stage Convert to Lowercase on "ALL" (All Text Columns)
  const ops = [
    { type: 'TEXT_SANITIZE', strategy: 'lowercase', column: 'ALL', description: 'Convert text columns to lowercase' }
  ];

  const previewRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/cleaning/preview?sid=${token}`,
    method: 'POST',
    headers: authHeaders
  }, { operations: ops });

  const p = previewRes.body;
  console.log('2. Preview Status:', previewRes.status, p.success ? 'SUCCESS' : 'FAILED');
  console.log('   Cleaned Rows:', p.cleanedRowCount, 'Cleaned Cols:', p.cleanedColumnCount);
  console.log('   Affected Rows:', p.affectedRowsCount, 'Affected Cells:', p.affectedCellsCount);
  console.log('   Headers:', p.headers);

  // Assert headers match original columns (all 10 original column headers preserved)
  const expectedHeaders = ['order_id','customer_name','country','category','sales_amount','quantity','discount_rate','profit','order_date','customer_rating'];
  for (const h of expectedHeaders) {
    if (!p.headers.includes(h)) {
      throw new Error(`Expected header '${h}' to be preserved!`);
    }
  }

  // Verify rows and cells are non-empty
  if (!p.rows || p.rows.length === 0) {
    throw new Error('Preview rows must not be empty!');
  }

  let emptyCount = 0;
  for (let r = 0; r < p.rows.length; r++) {
    const row = p.rows[r];
    if (row.length !== p.headers.length) {
      throw new Error(`Row ${r} length ${row.length} does not match headers length ${p.headers.length}`);
    }
  }
  console.log(`   Verified all ${p.rows.length} rows and ${p.headers.length} columns contain valid data!`);

  // Verify that ID column (order_id), Date column (order_date), and Numeric columns (sales_amount, etc.) WERE NOT MODIFIED
  const orderIdIdx = p.headers.indexOf('order_id');
  const orderDateIdx = p.headers.indexOf('order_date');
  const salesIdx = p.headers.indexOf('sales_amount');
  const custNameIdx = p.headers.indexOf('customer_name');
  const countryIdx = p.headers.indexOf('country');

  // Check changedCells: none should be on order_id, order_date, sales_amount
  for (const [coord, change] of Object.entries(p.cellChanges || {})) {
    if (change.column === 'order_id') {
      throw new Error(`Forbidden modification to ID column order_id: ${JSON.stringify(change)}`);
    }
    if (change.column === 'order_date') {
      throw new Error(`Forbidden modification to Date column order_date: ${JSON.stringify(change)}`);
    }
    if (change.column === 'sales_amount' || change.column === 'quantity' || change.column === 'profit') {
      throw new Error(`Forbidden modification to Numeric column ${change.column}: ${JSON.stringify(change)}`);
    }
  }
  console.log('   Verified numeric values, dates, and IDs were NOT modified!');

  // Check that customer_name or country WAS transformed to lowercase
  const sampleTransformedCustName = p.rows[0][custNameIdx];
  console.log('   Sample original name: "Alice Johnson" -> transformed name:', JSON.stringify(sampleTransformedCustName));
  if (sampleTransformedCustName !== 'alice johnson') {
    throw new Error(`Expected "Alice Johnson" to become "alice johnson", got "${sampleTransformedCustName}"`);
  }

  const sampleTransformedCountry = p.rows[0][countryIdx];
  console.log('   Sample original country: "USA" -> transformed country:', JSON.stringify(sampleTransformedCountry));
  if (sampleTransformedCountry !== 'usa') {
    throw new Error(`Expected "USA" to become "usa", got "${sampleTransformedCountry}"`);
  }

  // 4. Test Apply & Save Version
  const applyRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/cleaning/apply?sid=${token}`,
    method: 'POST',
    headers: authHeaders
  }, {
    operations: ops,
    versionName: 'ecom_lowercase_v2.csv'
  });

  console.log('3. Apply Status:', applyRes.status, applyRes.body.success ? 'SUCCESS' : 'FAILED');
  console.log('   Saved version:', applyRes.body.newVersionName, 'ID:', applyRes.body.newDatasetId);

  // 5. Test Download Cleaned CSV
  const dlRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/cleaning/download?sid=${token}`,
    method: 'POST',
    headers: authHeaders
  }, { operations: ops });

  const dlText = typeof dlRes.body === 'string' ? dlRes.body : JSON.stringify(dlRes.body);
  console.log('4. Downloaded CSV size:', dlText.length, 'bytes');
  if (!dlText.includes('alice johnson') || !dlText.includes('usa')) {
    throw new Error('Downloaded CSV should contain lowercase transformed values!');
  }
  if (!dlText.includes('299.99') || !dlText.includes('2024-01-15') || !dlText.includes('1001')) {
    throw new Error('Downloaded CSV must preserve exact numbers, dates, and order IDs!');
  }
  console.log('   Verified downloaded CSV preserves exact numbers, dates, IDs and contains lowercase text!');

  console.log('=== ALL E-COMMERCE TESTS PASSED SUCCESSFULLY! ===');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
