/**
 * DataLens — Comprehensive Analytics, Profiling, Cleaning & Reporting Verification Suite
 */

import http from 'http';

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

async function runSuite() {
  console.log('Starting DataLens Full Analytics & Data Profiling Verification Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string = '') {
    if (condition) {
      console.log(`PASS: [${testName}] ${detail}`);
      passed++;
    } else {
      console.error(`FAIL: [${testName}] ${detail}`);
      failed++;
    }
  }

  // Step 1: Sign up and Login
  const testEmail = `analyst_${Date.now()}@datalens.io`;
  const regRes = await makeRequest('POST', '/api/register', {
    fullName: 'Lead Analyst',
    email: testEmail,
    password: 'Password123!',
    confirmPassword: 'Password123!'
  });
  assert(regRes.status === 200, 'User Registration', `Status ${regRes.status}`);

  const loginRes = await makeRequest('POST', '/api/login', {
    email: testEmail,
    password: 'Password123!'
  });
  assert(loginRes.status === 200, 'User Login', `Status 200 OK`);

  const setCookie = loginRes.headers['set-cookie'];
  const sessionCookie = Array.isArray(setCookie) ? setCookie[0].split(';')[0] : '';
  const authHeaders = { Cookie: sessionCookie };

  // Step 2: Load Sample Dataset
  const sampleRes = await makeRequest('GET', '/api/sample-data?sample=ecommerce', undefined, authHeaders);
  const sampleJson = JSON.parse(sampleRes.body);
  assert(sampleJson.success === true && sampleJson.rowCount > 0, 'Load Sample Dataset', `Loaded ${sampleJson.datasetName} with ${sampleJson.rowCount} rows`);

  // Step 3: Verify Dashboard & Metadata Profiling
  const dashRes = await makeRequest('GET', '/api/dashboard', undefined, authHeaders);
  const dashJson = JSON.parse(dashRes.body);
  assert(
    dashJson.hasDataset === true && dashJson.metrics.rowCount === sampleJson.rowCount,
    'Dashboard Metrics Profiling',
    `Quality Score: ${dashJson.metrics.qualityScore}%, Missing: ${dashJson.metrics.missingCount}, Dups: ${dashJson.metrics.duplicateCount}`
  );

  // Step 4: Verify Data Quality API & Hygiene Dimensions
  const qualRes = await makeRequest('GET', '/api/quality', undefined, authHeaders);
  const qualJson = JSON.parse(qualRes.body);
  assert(
    qualJson.hasDataset === true && qualJson.dimensions.completeness !== undefined && Array.isArray(qualJson.issues),
    'Data Quality Audit API',
    `Completeness: ${qualJson.dimensions.completeness}%, Deductions: -${qualJson.deductions.missingDeduction}% missing, Issues count: ${qualJson.issues.length}`
  );

  // Step 5: Verify Comprehensive Statistics API (Numeric & Categorical)
  const statsRes = await makeRequest('GET', '/api/statistics', undefined, authHeaders);
  const statsJson = JSON.parse(statsRes.body);
  assert(
    statsJson.hasDataset === true && statsJson.numericColumns.length > 0,
    'Statistical Profiling API',
    `Analyzed ${statsJson.numericColumns.length} numeric columns and ${statsJson.categoricalColumns.length} categorical columns`
  );
  const firstNum = statsJson.numericColumns[0];
  assert(
    firstNum.mean !== undefined && firstNum.median !== undefined && firstNum.iqr !== undefined,
    'Tukey & Moment Stats Calculation',
    `${firstNum.name}: Min=${firstNum.min}, Max=${firstNum.max}, Mean=${firstNum.mean}, Median=${firstNum.median}, IQR=${firstNum.iqr}, StdDev=${firstNum.sampleStdDev}`
  );

  // Step 6: Verify Data Explorer & Dynamic Filtering
  const filterRes = await makeRequest('GET', '/api/filter?column=Order_ID&operator=is_not_empty', undefined, authHeaders);
  const filterJson = JSON.parse(filterRes.body);
  assert(
    filterJson.hasDataset === true && filterJson.matchedRows > 0,
    'Dynamic Data Explorer Filter',
    `Matched ${filterJson.matchedRows} of ${filterJson.totalRows} records`
  );

  // Step 7: Verify Visualizations (Histogram, Scatter, Boxplot, Heatmap)
  const histRes = await makeRequest('GET', `/api/visualization?chartType=histogram&xAxis=${encodeURIComponent(firstNum.name)}&bins=8`, undefined, authHeaders);
  const histJson = JSON.parse(histRes.body);
  assert(histJson.labels.length === 8 && histJson.values.length === 8, 'Histogram with Bins', `Computed 8 distribution intervals`);

  const boxRes = await makeRequest('GET', '/api/visualization?chartType=boxplot', undefined, authHeaders);
  const boxJson = JSON.parse(boxRes.body);
  assert(boxJson.boxData && boxJson.boxData.length > 0, '5-Number Summary Box Plot', `Calculated box summary across ${boxJson.boxData.length} columns`);

  const heatRes = await makeRequest('GET', '/api/visualization?chartType=correlation_heatmap', undefined, authHeaders);
  const heatJson = JSON.parse(heatRes.body);
  assert(heatJson.correlationMatrix && Object.keys(heatJson.correlationMatrix).length > 0, 'Pearson Correlation Matrix Heatmap', `Calculated correlation matrix`);

  // Step 8: Verify Automated Insights
  const insRes = await makeRequest('GET', '/api/insights', undefined, authHeaders);
  const insJson = JSON.parse(insRes.body);
  assert(Array.isArray(insJson.insights) && insJson.insights.length >= 4, 'Automated Rule Insights', `Generated ${insJson.insights.length} deterministic findings`);

  // Step 9: Verify Cleaning Studio (Preview Impact)
  const cleanPreviewRes = await makeRequest('POST', '/api/cleaning/preview', {
    operations: [
      { type: 'REMOVE_DUPLICATES', strategy: 'remove_exact', column: 'ALL' },
      { type: 'MISSING_VALUES', strategy: 'impute_mean', column: firstNum.name }
    ]
  }, authHeaders);
  const cleanPreviewJson = JSON.parse(cleanPreviewRes.body);
  assert(
    cleanPreviewJson.success === true && cleanPreviewJson.cleanedRowCount > 0,
    'Cleaning Studio Preview Impact',
    `Original rows: ${cleanPreviewJson.originalRowCount}, Cleaned rows: ${cleanPreviewJson.cleanedRowCount}, Affected cells: ${cleanPreviewJson.affectedCellsCount}`
  );

  // Step 10: Apply Cleaning & Save New Version
  const cleanApplyRes = await makeRequest('POST', '/api/cleaning/apply', {
    versionName: 'Cleaned_Ecommerce_Master',
    operations: [
      { type: 'REMOVE_DUPLICATES', strategy: 'remove_exact', column: 'ALL' },
      { type: 'MISSING_VALUES', strategy: 'impute_mean', column: firstNum.name }
    ]
  }, authHeaders);
  const cleanApplyJson = JSON.parse(cleanApplyRes.body);
  assert(
    cleanApplyJson.success === true && cleanApplyJson.newDatasetId > 0,
    'Cleaning Studio Apply & Save Version',
    `Created version "${cleanApplyJson.newVersionName}" (ID ${cleanApplyJson.newDatasetId}), Quality Score: ${cleanApplyJson.newQualityScore}%`
  );

  // Step 11: Validation Rules Studio (Add, Audit, Export, Delete)
  const addRuleRes = await makeRequest('POST', '/api/validation/add', {
    name: 'Order ID Must Be Unique',
    columnName: 'Order_ID',
    ruleType: 'UNIQUE'
  }, authHeaders);
  const rulesListRes = await makeRequest('GET', '/api/validation', undefined, authHeaders);
  const rulesListJson = JSON.parse(rulesListRes.body);
  assert(
    rulesListJson.rules && rulesListJson.rules.some((r: any) => r.ruleType === 'UNIQUE'),
    'Validation Rules Engine',
    `Evaluated ${rulesListJson.rules.length} custom audit rules with pass/fail tracking`
  );

  const valExportRes = await makeRequest('GET', '/api/validation/export', undefined, authHeaders);
  assert(
    valExportRes.status === 200 && valExportRes.body.includes('Rule ID,Rule Name'),
    'Validation Results Export (CSV)',
    `Exported CSV header verified`
  );

  // Step 12: Version Comparison Studio
  const versionsRes = await makeRequest('GET', '/api/comparison/versions', undefined, authHeaders);
  const versionsJson = JSON.parse(versionsRes.body);
  assert(versionsJson.versions.length >= 2, 'Version History Available for Comparison', `Found ${versionsJson.versions.length} versions`);

  const baseVer = versionsJson.versions[versionsJson.versions.length - 1]; // original
  const targetVer = versionsJson.versions[0]; // cleaned
  const cmpRes = await makeRequest('GET', `/api/comparison?baseId=${baseVer.id}&targetId=${targetVer.id}`, undefined, authHeaders);
  const cmpJson = JSON.parse(cmpRes.body);
  assert(
    cmpJson.success === true && cmpJson.baseVersionName !== undefined,
    'Version Comparison Delta Engine',
    `Compared "${cmpJson.baseVersionName}" vs "${cmpJson.targetVersionName}": Row delta = ${cmpJson.rowCountDelta}, Quality delta = ${cmpJson.qualityScoreDelta}%`
  );

  // Step 13: Reports & Exports Hub
  const dictRes = await makeRequest('GET', '/api/report/dictionary', undefined, authHeaders);
  assert(dictRes.status === 200 && dictRes.body.includes('Column Name,Data Type'), 'Data Dictionary CSV Export', 'Header verified');

  const qJsonRes = await makeRequest('GET', '/api/report/quality-json', undefined, authHeaders);
  const qReport = JSON.parse(qJsonRes.body);
  assert(qReport.reportType === 'DataLens Quality Audit' && qReport.dimensions, 'Quality Audit JSON Export', 'JSON schema verified');

  const datasetCsvRes = await makeRequest('GET', '/api/report/dataset', undefined, authHeaders);
  assert(datasetCsvRes.status === 200 && datasetCsvRes.body.length > 50, 'Active Dataset CSV Download', `Downloaded ${datasetCsvRes.body.length} bytes`);

  const auditTrailRes = await makeRequest('GET', '/api/report/audit-trail', undefined, authHeaders);
  assert(auditTrailRes.status === 200 && auditTrailRes.body.includes('Timestamp,Action'), 'Audit Trail Log CSV Download', 'Compliance audit records verified');

  const execRes = await makeRequest('GET', '/api/report/executive', undefined, authHeaders);
  assert(execRes.status === 200 && execRes.body.includes('Executive Data Profiling Report'), 'Executive Profiling Report HTML', 'HTML executive document generated');

  console.log('\n========================================');
  console.log('Analytics Verification Summary:');
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`TOTAL:  ${passed + failed}`);
  console.log('========================================');

  if (failed > 0) process.exit(1);
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
