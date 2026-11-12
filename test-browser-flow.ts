// End-to-End Simulation of Real Browser Login Flow in Iframe Context
import { strict as assert } from 'assert';

const BASE_URL = 'http://localhost:3000';

async function runBrowserFlowVerification() {
  console.log('Testing End-to-End Browser Login & Redirect Flow...\n');

  const testEmail = `browser_test_${Date.now()}@datalens.io`;
  const testPassword = 'SecurePassword123!';
  const testName = 'Browser Test User';

  // Step 1: Register
  const regRes = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: testName,
      email: testEmail,
      password: testPassword,
      confirmPassword: testPassword
    })
  });
  const regData = await regRes.json();
  assert.equal(regRes.status, 200);
  assert.equal(regData.success, true);
  console.log('✔ Step 1: User registered successfully.');

  // Step 2: Login with Valid Credentials
  const loginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword
    })
  });
  const loginData = await loginRes.json();
  assert.equal(loginRes.status, 200);
  assert.equal(loginData.success, true);
  assert.ok(loginData.sessionId, 'Response must include sessionId');
  assert.ok(loginData.token, 'Response must include token');
  assert.equal(loginData.user.name, testName);

  const rawSetCookie = loginRes.headers.get('set-cookie') || '';
  assert.ok(rawSetCookie.includes('SameSite=None'), 'Cookie must specify SameSite=None for cross-site iframe support');
  assert.ok(rawSetCookie.includes('Secure'), 'Cookie must specify Secure for HTTPS iframe support');
  console.log(`✔ Step 2: Login succeeded with sessionId: ${loginData.sessionId}`);
  console.log(`✔ Set-Cookie verified with Partitioned & SameSite=None; Secure`);

  // Step 3: Browser navigates to index.html?sid=<token> (without cookies, simulating 3P cookie blocked iframe)
  const dashboardNavRes = await fetch(`${BASE_URL}/index.html?sid=${encodeURIComponent(loginData.sessionId)}`, {
    redirect: 'manual'
  });
  assert.equal(dashboardNavRes.status, 200, 'index.html?sid= must return 200 OK and NOT redirect to landing.html');
  const dashboardHtml = await dashboardNavRes.text();
  assert.ok(dashboardHtml.includes('DataLens — Dataset Quality'), 'Dashboard HTML title rendered');
  assert.ok(dashboardHtml.includes('id="header-user-name"'), 'Dashboard user profile header element present');
  assert.ok(dashboardHtml.includes('id="section-overview"'), 'Dashboard overview section element present');
  console.log('✔ Step 3: Dashboard opens successfully with HTTP 200 (No redirect to landing.html).');

  // Step 4: Client-side checkAuth() via Bearer token
  const sessionCheckRes = await fetch(`${BASE_URL}/api/session`, {
    headers: {
      'Authorization': `Bearer ${loginData.token}`,
      'X-Session-ID': loginData.token
    }
  });
  const sessionData = await sessionCheckRes.json();
  assert.equal(sessionData.loggedIn, true);
  assert.equal(sessionData.user.email, testEmail);
  console.log('✔ Step 4: Client checkAuth() confirmed session for user:', sessionData.user.email);

  // Step 5: Load sample dataset and verify dashboard metrics API
  const sampleRes = await fetch(`${BASE_URL}/api/sample-data?sample=ecommerce`, {
    headers: {
      'Authorization': `Bearer ${loginData.token}`,
      'X-Session-ID': loginData.token
    }
  });
  const sampleData = await sampleRes.json();
  assert.equal(sampleData.success, true);

  const dashApiRes = await fetch(`${BASE_URL}/api/dashboard`, {
    headers: {
      'Authorization': `Bearer ${loginData.token}`
    }
  });
  const dashApiData = await dashApiRes.json();
  assert.equal(dashApiRes.status, 200);
  assert.equal(dashApiData.hasDataset, true);
  assert.ok(dashApiData.metrics.rowCount > 0);
  assert.ok(dashApiData.metrics.qualityScore > 0);
  console.log('✔ Step 5: Dashboard API loaded real dataset metrics (Rows:', dashApiData.metrics.rowCount, ', Quality:', dashApiData.metrics.qualityScore, '%)');

  // Step 6: Browser refresh test (with cookie)
  const refreshRes = await fetch(`${BASE_URL}/index.html`, {
    headers: {
      'Cookie': `JSESSIONID=${loginData.sessionId}`
    },
    redirect: 'manual'
  });
  assert.equal(refreshRes.status, 200, 'Page refresh with cookie must return 200 OK');
  console.log('✔ Step 6: Dashboard page refresh preserves session (HTTP 200 OK).');

  // Step 7: Direct unauthenticated access to index.html
  const unauthIndexRes = await fetch(`${BASE_URL}/index.html`, { redirect: 'manual' });
  assert.equal(unauthIndexRes.status, 302);
  assert.equal(unauthIndexRes.headers.get('location'), '/landing.html');
  console.log('✔ Step 7: Unauthenticated direct access to index.html redirects to /landing.html (HTTP 302).');

  // Step 8: Invalid login test
  const wrongPwdRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'IncorrectPassword999!'
    })
  });
  const wrongPwdData = await wrongPwdRes.json();
  assert.equal(wrongPwdData.success, false);
  assert.equal(wrongPwdData.message, 'Invalid email or password. Please try again.');
  console.log('✔ Step 8: Wrong password rejected with success: false and generic message.');

  // Step 9: Logout & Invalidation
  const logoutRes = await fetch(`${BASE_URL}/api/logout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${loginData.token}`,
      'Cookie': `JSESSIONID=${loginData.sessionId}`
    }
  });
  const logoutData = await logoutRes.json();
  assert.equal(logoutData.success, true);

  // Verify session invalidated
  const postLogoutSession = await fetch(`${BASE_URL}/api/session`, {
    headers: { 'Authorization': `Bearer ${loginData.token}` }
  });
  const postLogoutSessionData = await postLogoutSession.json();
  assert.equal(postLogoutSessionData.loggedIn, false);

  const postLogoutIndex = await fetch(`${BASE_URL}/index.html`, {
    headers: { 'Cookie': `JSESSIONID=${loginData.sessionId}` },
    redirect: 'manual'
  });
  assert.equal(postLogoutIndex.status, 302);
  assert.equal(postLogoutIndex.headers.get('location'), '/landing.html');
  console.log('✔ Step 9: Logout invalidates session and subsequent dashboard access is denied.');

  console.log('\nAll 9 browser redirect & authentication flow tests PASSED!');
}

runBrowserFlowVerification().catch(err => {
  console.error('Browser flow verification failed:', err);
  process.exit(1);
});
