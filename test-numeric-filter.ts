// DataLens Numeric Filtering & Explorer Verification Suite
import { strict as assert } from 'assert';

const BASE_URL = 'http://localhost:3000';

async function runNumericFilterSuite() {
  console.log('Starting DataLens Numeric Filtering Verification Suite...\n');

  // 1. Authenticate and set up active session
  const email = `numeric_tester_${Date.now()}@datalens.io`;
  const pwd = 'TestPassword123!';
  
  await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Numeric Tester', email, password: pwd, confirmPassword: pwd })
  });

  const loginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pwd })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'X-Session-ID': token
  };

  // 2. Load Ecommerce Orders Dataset (which contains order_id 1009 with sales_amount 3500.00)
  const sampleRes = await fetch(`${BASE_URL}/api/sample-data?sample=ecommerce`, { headers: authHeaders });
  const sampleData = await sampleRes.json();
  assert.equal(sampleData.success, true);
  console.log(`✔ Loaded dataset "${sampleData.datasetName}" with ${sampleData.rowCount} records.\n`);

  async function filterQuery(col: string, op: string, val: string, search = '', sortCol = '', sortOrder = 'asc', page = 1, pageSize = 25) {
    const q = new URLSearchParams();
    if (col) q.append('column', col);
    if (op) q.append('operator', op);
    if (val !== undefined && val !== null) q.append('value', val);
    if (search) q.append('search', search);
    if (sortCol) q.append('sortColumn', sortCol);
    if (sortOrder) q.append('sortOrder', sortOrder);
    q.append('page', String(page));
    q.append('pageSize', String(pageSize));

    const res = await fetch(`${BASE_URL}/api/filter?${q.toString()}`, { headers: authHeaders });
    return await res.json();
  }

  // --- REGRESSION MATRIX FROM PROMPT SPECIFICATION ---

  // Test 1: sales_amount: 3500.00 == 3500 -> Match (specifically order_id 1009)
  {
    const data = await filterQuery('sales_amount', 'equals', '3500');
    assert.equal(data.success, true);
    assert.equal(data.matchedRows, 1, 'sales_amount == 3500 should match 1 row');
    assert.equal(data.rows[0].order_id, '1009', 'Matched row must be order_id 1009');
    assert.equal(data.rows[0].sales_amount, '3500.00', 'Original cell value 3500.00 preserved in output');
    console.log('✔ Case 1: [3500.00 == 3500] MATCHED order_id 1009 (matchedRows = 1)');
  }

  // Test 2: sales_amount: 3500.00 == 3500.0 -> Match
  {
    const data = await filterQuery('sales_amount', 'equals', '3500.0');
    assert.equal(data.matchedRows, 1);
    assert.equal(data.rows[0].order_id, '1009');
    console.log('✔ Case 2: [3500.00 == 3500.0] MATCHED order_id 1009 (matchedRows = 1)');
  }

  // Test 3: sales_amount: 3500.00 == 3500.00 -> Match
  {
    const data = await filterQuery('sales_amount', 'equals', '3500.00');
    assert.equal(data.matchedRows, 1);
    assert.equal(data.rows[0].order_id, '1009');
    console.log('✔ Case 3: [3500.00 == 3500.00] MATCHED order_id 1009 (matchedRows = 1)');
  }

  // Test 4: sales_amount: 3500.00 == 3499.99 -> No match
  {
    const data = await filterQuery('sales_amount', 'equals', '3499.99');
    assert.equal(data.matchedRows, 0);
    console.log('✔ Case 4: [3500.00 == 3499.99] NO MATCH (matchedRows = 0)');
  }

  // Test 5: sales_amount: 3500.00 == 3501 -> No match
  {
    const data = await filterQuery('sales_amount', 'equals', '3501');
    assert.equal(data.matchedRows, 0);
    console.log('✔ Case 5: [3500.00 == 3501] NO MATCH (matchedRows = 0)');
  }

  // Test 6: sales_amount: 3500.00 > 3500 -> No match for 1009 (1020 with 9800 matches)
  {
    const data = await filterQuery('sales_amount', 'gt', '3500');
    const matched1009 = data.rows.some((r: any) => r.order_id === '1009');
    assert.equal(matched1009, false, 'order_id 1009 (3500.00) must not match gt 3500');
    assert.ok(data.matchedRows >= 1, 'Row with 9800.00 matches gt 3500');
    console.log('✔ Case 6: [3500.00 > 3500] NO MATCH for 1009');
  }

  // Test 7: sales_amount: 3500.00 >= 3500 -> Match
  {
    const data = await filterQuery('sales_amount', 'gte', '3500');
    const matched1009 = data.rows.some((r: any) => r.order_id === '1009');
    assert.equal(matched1009, true, 'order_id 1009 (3500.00) must match gte 3500');
    console.log('✔ Case 7: [3500.00 >= 3500] MATCHED order_id 1009');
  }

  // Test 8: sales_amount: 3500.00 < 3500 -> No match for 1009
  {
    const data = await filterQuery('sales_amount', 'lt', '3500');
    const matched1009 = data.rows.some((r: any) => r.order_id === '1009');
    assert.equal(matched1009, false, 'order_id 1009 (3500.00) must not match lt 3500');
    console.log('✔ Case 8: [3500.00 < 3500] NO MATCH for 1009');
  }

  // Test 9: sales_amount: 3500.00 <= 3500 -> Match
  {
    const data = await filterQuery('sales_amount', 'lte', '3500');
    const matched1009 = data.rows.some((r: any) => r.order_id === '1009');
    assert.equal(matched1009, true, 'order_id 1009 (3500.00) must match lte 3500');
    console.log('✔ Case 9: [3500.00 <= 3500] MATCHED order_id 1009');
  }

  // Test 10: sales_amount: 3500.00 == 3500abc -> Validation error; no false match
  {
    const data = await filterQuery('sales_amount', 'equals', '3500abc');
    assert.equal(data.matchedRows, 0, 'No false match when malformed input');
    assert.ok(data.validationError && data.validationError.includes('Invalid numeric filter input'), 'Returns validationError');
    console.log(`✔ Case 10: [3500.00 == 3500abc] VALIDATION ERROR: "${data.validationError}"`);
  }

  // Test 11: Null cell handling -> order_id 1013 has empty sales_amount
  {
    const dataEq = await filterQuery('sales_amount', 'equals', '3500');
    const matched1013 = dataEq.rows.some((r: any) => r.order_id === '1013');
    assert.equal(matched1013, false, 'Null cell (1013) does not match numeric equals');

    const dataEmpty = await filterQuery('sales_amount', 'is_empty', '');
    const matchedEmpty1013 = dataEmpty.rows.some((r: any) => r.order_id === '1013');
    assert.equal(matchedEmpty1013, true, 'Null cell (1013) matches is_empty');
    console.log('✔ Case 11: [Null == 3500: No Match] and [Null is_empty: Match (order_id 1013)]');
  }

  // Test 12: Zero and negative numbers verification
  {
    // discount_rate has 0.00 values
    const dataZero = await filterQuery('discount_rate', 'equals', '0');
    assert.ok(dataZero.matchedRows > 0, '0 matches 0.00 in discount_rate');
    const dataZeroDecimal = await filterQuery('discount_rate', 'equals', '0.00');
    assert.equal(dataZero.matchedRows, dataZeroDecimal.matchedRows, '0 and 0.00 yield identical matches');
    console.log(`✔ Case 12: [Zero equality 0 == 0.00] MATCHED ${dataZero.matchedRows} records`);
  }

  // Test 13: Sorting on filtered numeric dataset
  {
    const dataSortedDesc = await filterQuery('sales_amount', 'gte', '1000', '', 'sales_amount', 'desc');
    assert.ok(dataSortedDesc.matchedRows >= 2);
    const firstAmount = parseFloat(dataSortedDesc.rows[0].sales_amount);
    const secondAmount = parseFloat(dataSortedDesc.rows[1].sales_amount);
    assert.ok(firstAmount >= secondAmount, 'Numeric descending sort verified');
    console.log(`✔ Case 13: Filtered Numeric Sorting (Desc: ${firstAmount} >= ${secondAmount})`);
  }

  // Test 14: Global search combined with column filter
  {
    // Filter sales_amount >= 1000 AND search for "Electronics"
    const dataCombined = await filterQuery('sales_amount', 'gte', '1000', 'electronics');
    dataCombined.rows.forEach((r: any) => {
      assert.ok(parseFloat(r.sales_amount) >= 1000);
      assert.ok(JSON.stringify(r).toLowerCase().includes('electronics'));
    });
    console.log(`✔ Case 14: Global Search + Column Filter Combined: ${dataCombined.matchedRows} rows matched both`);
  }

  // Test 15: Filtered CSV export
  {
    const expRes = await fetch(`${BASE_URL}/api/filter?column=sales_amount&operator=equals&value=3500&export=true`, {
      headers: authHeaders
    });
    assert.equal(expRes.status, 200);
    assert.ok((expRes.headers.get('content-type') || '').includes('text/csv'));
    const csvText = await expRes.text();
    assert.ok(csvText.includes('order_id,customer_name'));
    assert.ok(csvText.includes('1009') && csvText.includes('3500.00'));
    assert.ok(!csvText.includes('1001'), 'Filtered CSV contains only matching records');
    console.log('✔ Case 15: Export Filtered CSV verified (contains order_id 1009, excludes non-matches)');
  }

  console.log('\n========================================');
  console.log('All 15 Numeric Filtering & Data Explorer Tests PASSED!');
  console.log('========================================\n');
}

runNumericFilterSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
