/**
 * DataLens — Active Dataset Management & Isolation Verification Suite
 * Verifies all 15 requirements:
 * 1. Single active dataset per authenticated user
 * 2. Empty state when user has no datasets
 * 3. First dataset uploaded becomes active
 * 4. Subsequent uploads do NOT replace active dataset; saved as Stored
 * 5. Activating a stored dataset atomically switches active dataset and marks previous as Stored
 * 6. History table has exactly one active dataset row per user
 * 7. Action column has 'In Use' for active dataset and 'Activate' for stored datasets
 * 8. All modules operate on the currently active dataset
 * 9. Dataset selection scoped to user (no global active dataset leakage)
 * 10. Preserves all stored records; duplicate filenames not merged or auto-deleted
 * 11. Multiple uploads with same filename preserve separate records and distinct IDs
 * 12. Deleting active dataset promotes next remaining dataset or leaves empty
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

function makeRequest(
  method: string,
  urlPath: string,
  data?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(urlPath, BASE_URL);
    const options: http.RequestOptions = {
      method,
      hostname: fullUrl.hostname,
      port: fullUrl.port,
      path: fullUrl.pathname + fullUrl.search,
      headers: { ...headers }
    };

    let postData: string | Buffer | undefined;
    if (data !== undefined) {
      if (typeof data === 'string') {
        postData = data;
        options.headers!['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
      } else if (Buffer.isBuffer(data)) {
        postData = data;
      } else {
        postData = JSON.stringify(data);
        options.headers!['Content-Type'] = 'application/json';
      }
      options.headers!['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body }));
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function uploadMultipart(
  urlPath: string,
  filename: string,
  fileContent: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const fullUrl = new URL(urlPath, BASE_URL);

    const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;

    const payload = Buffer.concat([
      Buffer.from(head, 'utf-8'),
      Buffer.from(fileContent, 'utf-8'),
      Buffer.from(tail, 'utf-8')
    ]);

    const req = http.request({
      method: 'POST',
      hostname: fullUrl.hostname,
      port: fullUrl.port,
      path: fullUrl.pathname + fullUrl.search,
      headers: {
        ...headers,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body }));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTestSuite() {
  console.log('Starting DataLens Active Dataset Management & Isolation Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string = '') {
    if (condition) {
      console.log(`✔ PASS: [${testName}] ${detail}`);
      passed++;
    } else {
      console.error(`✖ FAIL: [${testName}] ${detail}`);
      failed++;
    }
  }

  // Helper to register and log in a fresh user
  async function createAuthenticatedUser(prefix: string) {
    const email = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}@datalens.io`;
    const password = 'Password123!';
    await makeRequest('POST', '/api/register', {
      fullName: `${prefix} User`,
      email,
      password,
      confirmPassword: password
    });

    const loginRes = await makeRequest('POST', '/api/login', { email, password });
    const loginJson = JSON.parse(loginRes.body);
    const cookies = loginRes.headers['set-cookie'] || [];
    const sessionCookie = (cookies[0] || '').split(';')[0];
    const token = loginJson.token || loginJson.sessionId;

    return {
      userId: loginJson.user?.id,
      email,
      token,
      headers: {
        'Cookie': sessionCookie,
        'Authorization': `Bearer ${token}`,
        'X-Session-ID': token
      }
    };
  }

  // Test 1: User 1 starts with no datasets and sees empty state
  const user1 = await createAuthenticatedUser('user_alpha');
  const emptyDash = await makeRequest('GET', '/api/dashboard', undefined, user1.headers);
  const emptyDashJson = JSON.parse(emptyDash.body);
  assert(
    emptyDashJson.hasDataset === false && emptyDashJson.accountSummary.totalDatasets === 0,
    'Requirement 2: Empty state on dashboard for new user',
    `hasDataset=${emptyDashJson.hasDataset}, totalDatasets=${emptyDashJson.accountSummary.totalDatasets}`
  );

  const emptyHistory = await makeRequest('GET', '/api/history', undefined, user1.headers);
  const emptyHistJson = JSON.parse(emptyHistory.body);
  assert(
    emptyHistJson.success === true && emptyHistJson.history.length === 0 && emptyHistJson.activeDatasetId === -1,
    'Requirement 2: Empty history for new user with activeDatasetId = -1',
    `historyCount=${emptyHistJson.history.length}`
  );

  // Test 2: Upload FIRST dataset -> MUST become ACTIVE
  const csv1 = "id,name,amount\n101,Acme Alpha,150.00\n102,Beta Co,250.50\n103,Gamma Inc,350.00\n";
  const upRes1 = await uploadMultipart('/api/upload', 'dataset_one.csv', csv1, user1.headers);
  const upJson1 = JSON.parse(upRes1.body);
  assert(
    upJson1.success === true && upJson1.isActive === true && upJson1.activeDatasetId === upJson1.id,
    'Requirement 3: First dataset upload is automatically active',
    `id=${upJson1.id}, isActive=${upJson1.isActive}, activeDatasetId=${upJson1.activeDatasetId}`
  );
  const ds1Id = upJson1.id;

  // Verify dashboard now reflects dataset_one
  const dash1 = await makeRequest('GET', '/api/dashboard', undefined, user1.headers);
  const dashJson1 = JSON.parse(dash1.body);
  assert(
    dashJson1.hasDataset === true && dashJson1.dataset.id === ds1Id && dashJson1.dataset.fileName === 'dataset_one.csv',
    'Requirement 8: Dashboard displays first active dataset',
    `datasetId=${dashJson1.dataset.id}, fileName=${dashJson1.dataset.fileName}`
  );

  // Test 3: Upload SECOND dataset -> MUST NOT REPLACE active dataset; must be saved as STORED
  const csv2 = "sku,category,price\nSKU-1,Electronics,99.99\nSKU-2,Home,49.99\nSKU-3,Apparel,29.99\nSKU-4,Books,19.99\n";
  const upRes2 = await uploadMultipart('/api/upload', 'dataset_two.csv', csv2, user1.headers);
  const upJson2 = JSON.parse(upRes2.body);
  assert(
    upJson2.success === true && upJson2.isActive === false && upJson2.activeDatasetId === ds1Id,
    'Requirement 4: Second dataset upload preserves existing active dataset and marks upload as stored',
    `uploadedId=${upJson2.id}, isActive=${upJson2.isActive}, activeDatasetId=${upJson2.activeDatasetId}`
  );
  const ds2Id = upJson2.id;

  // Test 4: Upload THIRD dataset with the SAME filename as dataset 1 ('dataset_one.csv' repeated upload)
  const csv1Repeat = "id,name,amount\n201,Delta Repeat,500.00\n202,Epsilon Repeat,600.00\n";
  const upRes3 = await uploadMultipart('/api/upload', 'dataset_one.csv', csv1Repeat, user1.headers);
  const upJson3 = JSON.parse(upRes3.body);
  assert(
    upJson3.success === true && upJson3.isActive === false && upJson3.id !== ds1Id,
    'Requirement 10 & 11: Repeated upload with same filename preserved as separate stored record',
    `newRecordId=${upJson3.id}, firstRecordId=${ds1Id}, isActive=${upJson3.isActive}`
  );
  const ds3Id = upJson3.id;

  // Test 5: Verify History & Audit table has EXACTLY ONE active dataset row
  const histAfter3 = await makeRequest('GET', '/api/history', undefined, user1.headers);
  const histJsonAfter3 = JSON.parse(histAfter3.body);
  const activeRows = histJsonAfter3.history.filter((h: any) => h.isActive === true || h.active === true);
  const storedRows = histJsonAfter3.history.filter((h: any) => h.isActive === false && h.status === 'STORED');

  assert(
    histJsonAfter3.history.length === 3 && activeRows.length === 1 && storedRows.length === 2,
    'Requirement 6: History table contains exactly one Active Dataset and remaining Stored',
    `total=${histJsonAfter3.history.length}, activeCount=${activeRows.length}, storedCount=${storedRows.length}`
  );

  assert(
    activeRows[0].id === ds1Id && activeRows[0].fileName === 'dataset_one.csv',
    'Requirement 7: Original dataset 1 remains active with unique ID',
    `activeId=${activeRows[0].id}`
  );

  // Both dataset_one rows exist in history and are NOT merged
  const datasetOneRows = histJsonAfter3.history.filter((h: any) => h.fileName === 'dataset_one.csv');
  assert(
    datasetOneRows.length === 2 && datasetOneRows[0].id !== datasetOneRows[1].id,
    'Requirement 11 & 12: Multiple rows with same filename preserved with distinct IDs and upload times',
    `row1Id=${datasetOneRows[0].id} (active=${datasetOneRows[0].isActive}), row2Id=${datasetOneRows[1].id} (active=${datasetOneRows[1].isActive})`
  );

  // Test 6: Activate stored dataset 2 ('dataset_two.csv')
  const actRes = await makeRequest('POST', '/api/history', `action=activate&id=${ds2Id}`, {
    ...user1.headers,
    'Content-Type': 'application/x-www-form-urlencoded'
  });
  const actJson = JSON.parse(actRes.body);
  assert(
    actJson.success === true && actJson.activeDatasetId === ds2Id && actJson.datasetName === 'dataset_two.csv',
    'Requirement 5: Activating stored dataset 2 succeeds and returns new activeDatasetId',
    `activeDatasetId=${actJson.activeDatasetId}`
  );

  // Verify history state after activation: dataset 2 is now ACTIVE, dataset 1 is now STORED
  const histAfterAct = await makeRequest('GET', '/api/history', undefined, user1.headers);
  const histJsonAfterAct = JSON.parse(histAfterAct.body);
  const activeAfterAct = histJsonAfterAct.history.filter((h: any) => h.isActive === true);
  assert(
    activeAfterAct.length === 1 && activeAfterAct[0].id === ds2Id,
    'Requirement 5 & 6: Exactly one active dataset after activation (dataset 2 is now Active, previous is Stored)',
    `activeId=${activeAfterAct[0].id}, expected=${ds2Id}`
  );

  // Test 7: Verify all modules now operate on dataset 2 (columns: sku, category, price)
  const prevRes = await makeRequest('GET', '/api/preview', undefined, user1.headers);
  const prevJson = JSON.parse(prevRes.body);
  const hasSkuCol = prevJson.columns && prevJson.columns.some((c: any) => (typeof c === 'string' ? c : c.name) === 'sku');
  assert(
    hasSkuCol === true && prevJson.totalRows === 4,
    'Requirement 8: Preview module operates on newly activated dataset 2',
    `rows=${prevJson.totalRows}, columns=${prevJson.columns.map((c: any) => typeof c === 'string' ? c : c.name).join(', ')}`
  );

  const statsRes = await makeRequest('GET', '/api/statistics', undefined, user1.headers);
  const statsJson = JSON.parse(statsRes.body);
  const priceCol = statsJson.numericColumns.find((c: any) => c.name === 'price');
  assert(
    Boolean(priceCol && priceCol.count === 4),
    'Requirement 8: Statistics module operates on newly activated dataset 2 (numeric column: price)',
    `priceMean=${priceCol?.mean}`
  );

  // Test 8: User Isolation (User 2 cannot see or activate User 1 datasets)
  const user2 = await createAuthenticatedUser('user_beta');
  const user2Hist = await makeRequest('GET', '/api/history', undefined, user2.headers);
  const user2HistJson = JSON.parse(user2Hist.body);
  assert(
    user2HistJson.history.length === 0,
    'Requirement 9: User 2 cannot see User 1 datasets (Strict user scoping)',
    `user2HistoryCount=${user2HistJson.history.length}`
  );

  // User 2 attempts to activate User 1's dataset -> MUST be rejected
  const stealRes = await makeRequest('POST', '/api/history', `action=activate&id=${ds2Id}`, {
    ...user2.headers,
    'Content-Type': 'application/x-www-form-urlencoded'
  });
  const stealJson = JSON.parse(stealRes.body);
  assert(
    stealJson.success === false,
    'Requirement 5 & 9: Unauthorized activation rejected for different user',
    `message=${stealJson.message}`
  );

  // User 2 uploads their own dataset
  const csvUser2 = "code,title\nC1,Alpha Beta\nC2,Gamma Delta\n";
  const upResUser2 = await uploadMultipart('/api/upload', 'user2_dataset.csv', csvUser2, user2.headers);
  const upJsonUser2 = JSON.parse(upResUser2.body);
  assert(
    upJsonUser2.success === true && upJsonUser2.isActive === true,
    'Requirement 9: User 2 first upload becomes their active dataset independently',
    `user2ActiveId=${upJsonUser2.id}`
  );

  // Verify User 1 active dataset is still ds2Id
  const user1HistVerify = await makeRequest('GET', '/api/history', undefined, user1.headers);
  const user1HistVerifyJson = JSON.parse(user1HistVerify.body);
  assert(
    user1HistVerifyJson.activeDatasetId === ds2Id,
    'Requirement 9: User 1 active dataset unaffected by User 2 operations',
    `user1ActiveId=${user1HistVerifyJson.activeDatasetId}`
  );

  // Test 9: Deleting the active dataset selects another valid dataset or leaves user with no active dataset
  // User 1 active dataset is ds2Id. Delete it!
  const delActiveRes = await makeRequest('POST', '/api/history', `action=delete&id=${ds2Id}`, {
    ...user1.headers,
    'Content-Type': 'application/x-www-form-urlencoded'
  });
  const delActiveJson = JSON.parse(delActiveRes.body);
  assert(
    delActiveJson.success === true,
    'Requirement 15: Active dataset deleted successfully',
    `deletedId=${delActiveJson.deletedId}`
  );

  // Verify that another valid remaining dataset was automatically activated
  const histAfterDelActive = await makeRequest('GET', '/api/history', undefined, user1.headers);
  const histJsonAfterDelActive = JSON.parse(histAfterDelActive.body);
  const newActiveRows = histJsonAfterDelActive.history.filter((h: any) => h.isActive === true);
  assert(
    histJsonAfterDelActive.history.length === 2 && newActiveRows.length === 1 && (newActiveRows[0].id === ds1Id || newActiveRows[0].id === ds3Id),
    'Requirement 15: Deleting active dataset promoted a remaining valid dataset to active',
    `newActiveId=${newActiveRows[0].id}, remainingCount=${histJsonAfterDelActive.history.length}`
  );

  // Delete remaining 2 datasets
  for (const remaining of histJsonAfterDelActive.history) {
    await makeRequest('POST', '/api/history', `action=delete&id=${remaining.id}`, {
      ...user1.headers,
      'Content-Type': 'application/x-www-form-urlencoded'
    });
  }

  // Verify user now has no datasets and no active dataset
  const histFinal = await makeRequest('GET', '/api/history', undefined, user1.headers);
  const histJsonFinal = JSON.parse(histFinal.body);
  assert(
    histJsonFinal.history.length === 0 && histJsonFinal.activeDatasetId === -1,
    'Requirement 15: Deleting all datasets leaves user with no active dataset (-1)',
    `historyCount=${histJsonFinal.history.length}, activeDatasetId=${histJsonFinal.activeDatasetId}`
  );

  const dashFinal = await makeRequest('GET', '/api/dashboard', undefined, user1.headers);
  const dashJsonFinal = JSON.parse(dashFinal.body);
  assert(
    dashJsonFinal.hasDataset === false,
    'Requirement 2 & 15: Dashboard reports hasDataset=false when all datasets deleted',
    `hasDataset=${dashJsonFinal.hasDataset}`
  );

  console.log('\n========================================');
  console.log('Active Dataset Management Test Results:');
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`TOTAL:  ${passed + failed}`);
  console.log('========================================');

  if (failed > 0) process.exit(1);
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
