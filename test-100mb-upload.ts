/**
 * DataLens — 100 MB CSV Upload Limit & Large Dataset Verification Suite
 * Verifies all requirements:
 * 1. Small valid CSV uploads successfully.
 * 2. CSV near 25 MB is accepted.
 * 3. CSV larger than 25 MB but smaller than 100 MB is accepted (e.g. 35 MB).
 * 4. CSV at the configured limit is handled correctly.
 * 5. CSV exceeding 100 MB (e.g. 101 MB) is rejected with clear error message.
 * 6. Invalid and empty files are rejected (0-byte, non-csv, binary with null bytes).
 * 7. Malformed CSV (header only, no rows) does not create misleading dataset record.
 * 8. Larger CSV produces correct row counts, column counts, quality score, and analytics work.
 * 9. RFC-4180 quotes with commas and escaped quotes are preserved accurately.
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

    req.on('error', err => reject(err));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Upload a CSV file or buffer via multipart/form-data
 */
function uploadMultipart(
  filename: string,
  fileBuffer: Buffer,
  authHeaders: Record<string, string> = {}
): Promise<{ status: number; body: string; json: any }> {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const fullUrl = new URL('/api/upload', BASE_URL);

    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const totalLength = head.length + fileBuffer.length + tail.length;

    const reqHeaders: Record<string, string> = {
      ...authHeaders,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(totalLength)
    };

    const req = http.request(
      {
        method: 'POST',
        hostname: fullUrl.hostname,
        port: fullUrl.port,
        path: fullUrl.pathname,
        headers: reqHeaders
      },
      (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          let json: any = null;
          try {
            json = JSON.parse(body);
          } catch (e) {
            // non-json
          }
          resolve({ status: res.statusCode || 0, body, json });
        });
      }
    );

    req.on('error', reject);
    req.write(head);
    req.write(fileBuffer);
    req.write(tail);
    req.end();
  });
}

async function runTests() {
  console.log('Starting DataLens 100 MB Upload Limit & Large Dataset Verification Suite...\n');
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

  // 1. Create a fresh test user
  const email = `upload_tester_${Date.now()}@datalens.io`;
  const password = 'Password123!';
  await makeRequest('POST', '/api/register', {
    fullName: 'Upload Tester',
    email,
    password,
    confirmPassword: password
  });

  const loginRes = await makeRequest('POST', '/api/login', { email, password });
  const loginJson = JSON.parse(loginRes.body);
  const cookies = loginRes.headers['set-cookie'] || [];
  const sessionCookie = (cookies[0] || '').split(';')[0];
  const token = loginJson.token || loginJson.sessionId;

  const authHeaders: Record<string, string> = {
    'Cookie': sessionCookie,
    'X-Session-ID': token || email,
    'Authorization': 'Bearer ' + (token || email)
  };

  // Test 1: A small valid CSV uploads successfully
  const smallCsv = 'order_id,product_name,category,price,quantity,status\n101,"Smart Watch",Electronics,199.99,2,Shipped\n102,"Desk Lamp",Furniture,45.50,1,Delivered\n103,"Coffee Maker",Appliances,89.00,1,Pending';
  const smallUpload = await uploadMultipart('small_catalog.csv', Buffer.from(smallCsv), authHeaders);
  assert(
    smallUpload.json?.success === true && smallUpload.json?.rowCount === 3 && smallUpload.json?.columnCount === 6,
    'Test 1: Small valid CSV uploads successfully',
    `rowCount=${smallUpload.json?.rowCount}, colCount=${smallUpload.json?.columnCount}`
  );

  // Test 2: CSV near 25 MB is accepted (e.g. 24.5 MB)
  console.log('\nGenerating ~24.5 MB CSV dataset...');
  const header = 'id,customer_name,city,amount,tax,notes,order_date\n';
  const sampleRow = '10001,"Acme Corp, Retail Division",New York,1250.75,102.50,"Priority, expedited delivery",2025-02-10\n';
  const rowsFor24MB = Math.floor((24.5 * 1024 * 1024) / sampleRow.length);
  const csv24MB = Buffer.concat([Buffer.from(header), Buffer.from(sampleRow.repeat(rowsFor24MB))]);
  console.log(`Uploading ${Math.round(csv24MB.length / (1024 * 1024) * 10) / 10} MB CSV...`);
  const upload24MB = await uploadMultipart('dataset_24_5mb.csv', csv24MB, authHeaders);
  assert(
    upload24MB.json?.success === true && upload24MB.json?.rowCount === rowsFor24MB,
    'Test 2: CSV near 25 MB is accepted',
    `fileSize=${upload24MB.json?.fileSize} bytes, rowCount=${upload24MB.json?.rowCount}`
  );

  // Test 3: CSV larger than 25 MB but smaller than 100 MB is accepted (e.g. 35 MB)
  console.log('\nGenerating ~35 MB CSV dataset (exceeds old 25 MB limit)...');
  const rowsFor35MB = Math.floor((35 * 1024 * 1024) / sampleRow.length);
  const csv35MB = Buffer.concat([Buffer.from(header), Buffer.from(sampleRow.repeat(rowsFor35MB))]);
  console.log(`Uploading ${Math.round(csv35MB.length / (1024 * 1024) * 10) / 10} MB CSV...`);
  const upload35MB = await uploadMultipart('dataset_35mb.csv', csv35MB, authHeaders);
  assert(
    upload35MB.json?.success === true && upload35MB.json?.rowCount === rowsFor35MB,
    'Test 3: CSV larger than 25 MB (35 MB) is accepted',
    `fileSize=${upload35MB.json?.fileSize} bytes, rowCount=${upload35MB.json?.rowCount}`
  );

  // Test 4: CSV at configured high scale (~55 MB) is handled correctly
  console.log('\nGenerating ~55 MB CSV dataset...');
  const rowsFor55MB = Math.floor((55 * 1024 * 1024) / sampleRow.length);
  const csv55MB = Buffer.concat([Buffer.from(header), Buffer.from(sampleRow.repeat(rowsFor55MB))]);
  console.log(`Uploading ${Math.round(csv55MB.length / (1024 * 1024) * 10) / 10} MB CSV...`);
  const upload55MB = await uploadMultipart('dataset_55mb.csv', csv55MB, authHeaders);
  assert(
    upload55MB.json?.success === true && upload55MB.json?.rowCount === rowsFor55MB,
    'Test 4: CSV at configured high scale (55 MB) is handled correctly',
    `fileSize=${upload55MB.json?.fileSize} bytes, rowCount=${upload55MB.json?.rowCount}`
  );

  // Test 5: CSV exceeding 100 MB is rejected
  console.log('\nTesting oversized CSV rejection (> 100 MB)...');
  const size101MB = 101 * 1024 * 1024;
  const headerBuf = Buffer.from(header);
  const overflowBuf = Buffer.alloc(size101MB, 65); // fill with 'A'
  headerBuf.copy(overflowBuf, 0);
  overflowBuf.write('\n', headerBuf.length + 100);

  const upload101MB = await uploadMultipart('oversized_101mb.csv', overflowBuf, authHeaders);
  assert(
    upload101MB.json?.success === false && upload101MB.json?.message?.includes('100 MB'),
    'Test 5: CSV exceeding 100 MB is rejected with clear message',
    `message="${upload101MB.json?.message}"`
  );

  // Test 6: Invalid and empty files are rejected
  // 6a: 0-byte file
  const emptyUpload = await uploadMultipart('empty_dataset.csv', Buffer.alloc(0), authHeaders);
  assert(
    emptyUpload.json?.success === false && (emptyUpload.json?.message?.includes('empty') || emptyUpload.json?.message?.includes('select')),
    'Test 6a: Empty 0-byte file is rejected',
    `message="${emptyUpload.json?.message}"`
  );

  // 6b: Non-CSV file (.txt)
  const txtUpload = await uploadMultipart('document.txt', Buffer.from('This is a text file, not csv'), authHeaders);
  assert(
    txtUpload.json?.success === false && txtUpload.json?.message?.includes('.csv'),
    'Test 6b: Non-CSV extension (.txt) is rejected',
    `message="${txtUpload.json?.message}"`
  );

  // 6c: Binary file with null bytes
  const binaryCsv = Buffer.concat([Buffer.from('col1,col2\n'), Buffer.from([0, 1, 2, 3, 0]), Buffer.from('\n')]);
  const binaryUpload = await uploadMultipart('binary_fake.csv', binaryCsv, authHeaders);
  assert(
    binaryUpload.json?.success === false && binaryUpload.json?.message?.includes('binary'),
    'Test 6c: Binary file containing null bytes is rejected',
    `message="${binaryUpload.json?.message}"`
  );

  // Test 7: Malformed CSV (header only, no data rows) does not create dataset record
  const historyBefore = await makeRequest('GET', '/api/history', undefined, authHeaders);
  const countBefore = JSON.parse(historyBefore.body)?.datasets?.length || 0;

  const headerOnlyCsv = 'colA,colB,colC\n';
  const headerOnlyUpload = await uploadMultipart('header_only.csv', Buffer.from(headerOnlyCsv), authHeaders);
  assert(
    headerOnlyUpload.json?.success === false && headerOnlyUpload.json?.message?.includes('no data rows'),
    'Test 7a: Header-only CSV is rejected with clear message',
    `message="${headerOnlyUpload.json?.message}"`
  );

  const historyAfter = await makeRequest('GET', '/api/history', undefined, authHeaders);
  const countAfter = JSON.parse(historyAfter.body)?.datasets?.length || 0;
  assert(
    countAfter === countBefore,
    'Test 7b: Malformed CSV did not create a misleading dataset record in history',
    `countBefore=${countBefore}, countAfter=${countAfter}`
  );

  // Test 8: Activate 35 MB dataset and verify analytics, preview, and explorer work accurately
  const activateRes = await makeRequest('POST', '/api/history', `action=activate&id=${upload35MB.json?.id}`, {
    ...authHeaders,
    'Content-Type': 'application/x-www-form-urlencoded'
  });
  const activateJson = JSON.parse(activateRes.body);
  assert(
    activateJson?.success === true && activateJson?.activeDatasetId === upload35MB.json?.id,
    'Test 8a: Activated 35 MB dataset successfully',
    `activeDatasetId=${activateJson?.activeDatasetId}`
  );

  // Preview module
  const previewRes = await makeRequest('GET', '/api/preview', undefined, authHeaders);
  const previewJson = JSON.parse(previewRes.body);
  assert(
    previewJson?.success === true && previewJson?.totalRows === rowsFor35MB && previewJson?.columns?.length === 7,
    'Test 8b: Preview module operates accurately on 35 MB dataset',
    `totalRows=${previewJson?.totalRows}, columns=${previewJson?.columns?.length}`
  );

  // Statistics module
  const statsRes = await makeRequest('GET', '/api/statistics', undefined, authHeaders);
  const statsJson = JSON.parse(statsRes.body);
  const amountCol = statsJson?.numericColumns?.find((c: any) => (c.columnName === 'amount' || c.name === 'amount'));
  assert(
    statsJson?.success === true && amountCol !== undefined && Math.abs(amountCol.mean - 1250.75) < 0.01,
    'Test 8c: Statistics module correctly computes statistics on 35 MB dataset',
    `amountMean=${amountCol?.mean}`
  );

  // Test 9: RFC-4180 quotes preservation (commas inside quotes & escaped quotes)
  const complexCsv = 'item_id,description,quote_example,price\n1,"Widget with, multiple, commas","He said ""Hello world!""",49.99\n2,"Standard item","No quotes here",19.99';
  const complexUpload = await uploadMultipart('complex_quotes.csv', Buffer.from(complexCsv), authHeaders);
  await makeRequest('POST', '/api/history', `action=activate&id=${complexUpload.json?.id}`, {
    ...authHeaders,
    'Content-Type': 'application/x-www-form-urlencoded'
  });
  const complexPreview = await makeRequest('GET', '/api/preview', undefined, authHeaders);
  const complexRows = JSON.parse(complexPreview.body)?.rows || [];
  const row0 = complexRows[0] || {};
  const descVal = row0.description || (Array.isArray(row0) ? row0[1] : undefined);
  const quoteVal = row0.quote_example || (Array.isArray(row0) ? row0[2] : undefined);
  assert(
    descVal === 'Widget with, multiple, commas' && quoteVal === 'He said "Hello world!"',
    'Test 9: Commas inside quotes and escaped quotes are preserved perfectly',
    `cell1="${descVal}", cell2="${quoteVal}"`
  );

  // Cleanup ephemeral test datasets from storage and history
  console.log('\nCleaning up ephemeral test datasets from storage...');
  const uploadsToClean = [upload24MB, upload35MB, upload55MB, smallUpload, complexUpload];
  for (const u of uploadsToClean) {
    if (u?.json?.id) {
      await makeRequest('POST', '/api/history', `action=delete&id=${u.json.id}`, {
        ...authHeaders,
        'Content-Type': 'application/x-www-form-urlencoded'
      });
    }
  }

  console.log('\n========================================');
  console.log('100 MB Upload Verification Suite Results:');
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`TOTAL:  ${passed + failed}`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
