/**
 * DataLens — Automated Authentication and Security Test Runner
 * Validates all 14 authentication verification requirements over HTTP against port 3000.
 */

const BASE_URL = 'http://localhost:3000';

interface ApiResponse {
  success?: boolean;
  loggedIn?: boolean;
  message?: string;
  user?: { id: number; name: string; email: string };
  status?: number;
}

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail: string = '') {
  if (condition) {
    console.log(`PASS: [${testName}] ${detail}`);
    passedCount++;
  } else {
    console.error(`FAIL: [${testName}] ${detail}`);
    failedCount++;
  }
}

let globalCookieJar = '';

async function request(path: string, options: any = {}): Promise<{ status: number; data: any; headers: Headers; cookie?: string }> {
  const url = `${BASE_URL}${path}`;
  const headers = { ...(options.headers || {}) };
  const cookieToSend = options.cookie !== undefined ? options.cookie : globalCookieJar;
  if (cookieToSend) {
    headers['Cookie'] = cookieToSend;
  }
  const res = await fetch(url, { ...options, headers });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/JSESSIONID=[^;]+/);
    if (match) {
      if (setCookie.includes('Expires=')) {
        globalCookieJar = '';
      } else {
        globalCookieJar = match[0];
      }
    }
  }
  let data: any = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, data, headers: res.headers, cookie: setCookie || undefined };
}

async function runAllTests() {
  console.log('Starting DataLens Authentication & Security Verification Suite...\n');

  // Ensure clean state by logging out first
  await request('/api/logout', { method: 'POST' });

  // 1. Empty fields validation
  {
    const rBoth = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '', password: '' })
    });
    assert(
      rBoth.data?.success === false && rBoth.data?.message === 'Please enter your email and password.',
      'Test 6a: Empty Fields (Both empty)',
      `Got message: "${rBoth.data?.message}"`
    );

    const rEmail = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '', password: 'somepassword' })
    });
    assert(
      rEmail.data?.success === false && rEmail.data?.message === 'Please enter your email address.',
      'Test 6b: Empty Fields (Email empty)',
      `Got message: "${rEmail.data?.message}"`
    );

    const rPwd = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: '' })
    });
    assert(
      rPwd.data?.success === false && rPwd.data?.message === 'Please enter your password.',
      'Test 6c: Empty Fields (Password empty)',
      `Got message: "${rPwd.data?.message}"`
    );
  }

  // 2. Invalid email format
  {
    const rInvalidEmail = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'password123' })
    });
    assert(
      rInvalidEmail.data?.success === false && rInvalidEmail.data?.message === 'Please enter a valid email address.',
      'Test 7: Invalid Email Format',
      `Got message: "${rInvalidEmail.data?.message}"`
    );
  }

  // 3. Password confirmation mismatch
  {
    const rMismatch = await request('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        password: 'password123',
        confirmPassword: 'differentpassword'
      })
    });
    assert(
      rMismatch.data?.success === false && rMismatch.data?.message === 'Passwords do not match. Please re-enter.',
      'Test 10: Password-Confirmation Mismatch',
      `Got message: "${rMismatch.data?.message}"`
    );
  }

  // 4. Successful registration
  const targetEmail = `audit_user_${Date.now()}@datalens.io`;
  const targetPassword = 'SecurePassword789!';
  {
    const rReg = await request('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Audit User',
        email: targetEmail,
        password: targetPassword,
        confirmPassword: targetPassword
      })
    });
    assert(
      rReg.data?.success === true && rReg.data?.message === 'Account created successfully! Please sign in.',
      'Test 8: Successful Registration',
      `Got: ${JSON.stringify(rReg.data)}`
    );
  }

  // 5. Duplicate registration rejection
  {
    const rDup = await request('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Audit User Duplicate',
        email: targetEmail,
        password: targetPassword,
        confirmPassword: targetPassword
      })
    });
    assert(
      rDup.data?.success === false && rDup.data?.message === 'An account with this email already exists. Please sign in or use another email.',
      'Test 9: Duplicate Registration',
      `Got message: "${rDup.data?.message}"`
    );
  }

  // 6. Unregistered email login attempt
  {
    const rUnreg = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'unregistered_unknown_person@datalens.io',
        password: 'anyPassword123'
      })
    });
    assert(
      rUnreg.data?.success === false && rUnreg.data?.message === 'Invalid email or password. Please try again.',
      'Test 5: Unregistered Email Failure (Never leaks existence)',
      `Got message: "${rUnreg.data?.message}"`
    );
  }

  // 7. Wrong password login attempt
  {
    const rWrong = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: targetEmail,
        password: 'IncorrectPassword999'
      })
    });
    assert(
      rWrong.data?.success === false && rWrong.data?.message === 'Invalid email or password. Please try again.',
      'Test 2: Wrong Password Failure',
      `Got message: "${rWrong.data?.message}"`
    );
  }

  // 8. Partial password login attempts (e.g. 78963 vs 78963214)
  {
    // Register specific user with 78963214
    const exactEmail = `exact_code_${Date.now()}@datalens.io`;
    const exactPwd = '78963214';
    await request('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Exact Code User',
        email: exactEmail,
        password: exactPwd,
        confirmPassword: exactPwd
      })
    });

    const rPartial1 = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: exactEmail, password: '78963' })
    });
    const rPartial2 = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: exactEmail, password: '7896321' })
    });
    assert(
      rPartial1.data?.success === false && rPartial2.data?.success === false &&
      rPartial1.data?.message === 'Invalid email or password. Please try again.',
      'Test 3: Partial Password Rejection (e.g. 78963 and 7896321)',
      `Both failed as expected without substring matching`
    );

    // 9. Password with extra characters (789632140 and 78963215)
    const rExtra1 = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: exactEmail, password: '789632140' })
    });
    const rExtra2 = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: exactEmail, password: '78963215' })
    });
    assert(
      rExtra1.data?.success === false && rExtra2.data?.success === false &&
      rExtra1.data?.message === 'Invalid email or password. Please try again.',
      'Test 4: Password with Extra Characters Rejection (e.g. 789632140 and 78963215)',
      `Both rejected as expected`
    );
  }

  // 10. Failed login creates no authenticated session
  {
    const rSession = await request('/api/session');
    assert(
      rSession.data?.loggedIn === false && rSession.data?.user === null,
      'Test 11: Failed Login Creates No Session',
      `Session status: loggedIn=${rSession.data?.loggedIn}`
    );
  }

  // 11. Correct login succeeds
  {
    const rLogin = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: targetEmail,
        password: targetPassword
      })
    });
    assert(
      rLogin.data?.success === true && rLogin.data?.user?.email === targetEmail,
      'Test 1: Correct Login',
      `Login confirmed for: ${rLogin.data?.user?.email}`
    );
  }

  // 12. Successful login creates a valid session
  {
    const rSession = await request('/api/session');
    assert(
      rSession.data?.loggedIn === true && rSession.data?.user?.email === targetEmail,
      'Test 12: Successful Login Creates Valid Session',
      `Active user: ${rSession.data?.user?.name} (${rSession.data?.user?.email})`
    );
  }

  // 13. Logout invalidates session
  {
    const rLogout = await request('/api/logout', { method: 'POST' });
    assert(
      rLogout.data?.success === true && rLogout.data?.message === 'Logged out successfully',
      'Test 13a: Logout Endpoint',
      `Got message: "${rLogout.data?.message}"`
    );

    const rSessionAfter = await request('/api/session');
    assert(
      rSessionAfter.data?.loggedIn === false && rSessionAfter.data?.user === null,
      'Test 13b: Session Invalidated After Logout',
      `Session loggedIn=${rSessionAfter.data?.loggedIn}`
    );
  }

  // 14. Protected pages and APIs reject unauthenticated requests
  {
    const rDashboard = await request('/api/dashboard');
    assert(
      rDashboard.status === 401 && rDashboard.data?.loggedIn === false,
      'Test 14a: Protected API /api/dashboard Returns 401',
      `HTTP status: ${rDashboard.status}, message: "${rDashboard.data?.message}"`
    );

    const rUpload = await request('/api/upload', { method: 'POST' });
    assert(
      rUpload.status === 401 && rUpload.data?.loggedIn === false,
      'Test 14b: Protected API /api/upload Returns 401',
      `HTTP status: ${rUpload.status}`
    );

    const rHistory = await request('/api/history');
    assert(
      rHistory.status === 401 && rHistory.data?.loggedIn === false,
      'Test 14c: Protected API /api/history Returns 401',
      `HTTP status: ${rHistory.status}`
    );
  }

  // 14d. Cross-User Dataset Ownership Isolation (User A requests User B's dataset -> Access denied)
  {
    // User A registers, logs in, and loads a sample dataset
    const userAEmail = `user_a_${Date.now()}@datalens.io`;
    const userBEmail = `user_b_${Date.now()}@datalens.io`;
    const pwd = 'SharedPassword123!';

    // Register User A & User B
    await request('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'User Alpha', email: userAEmail, password: pwd, confirmPassword: pwd })
    });
    await request('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'User Beta', email: userBEmail, password: pwd, confirmPassword: pwd })
    });

    // Login User A
    const loginA = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userAEmail, password: pwd })
    });
    const cookieA = loginA.cookie;

    // User A loads sample dataset
    const loadSampleA = await request('/api/sample-data', {
      method: 'POST',
      cookie: cookieA,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sampleKey: 'ecommerce' })
    });
    const datasetAId = loadSampleA.data?.datasetId || 1;

    // Login User B with separate session
    const loginB = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userBEmail, password: pwd })
    });
    const cookieB = loginB.cookie;

    // User B tries to delete or access User A's dataset
    const userBDeleteAttempt = await request(`/api/history/delete`, {
      method: 'POST',
      cookie: cookieB,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id=${datasetAId}&action=delete`
    });

    // User B's history should not contain User A's dataset
    const userBHistory = await request('/api/history', {
      method: 'GET',
      cookie: cookieB
    });
    const userBHasDatasetA = (userBHistory.data?.history || []).some((d: any) => d.id === datasetAId);

    assert(
      userBDeleteAttempt.data?.success === false && !userBHasDatasetA,
      "Test 14d: Cross-User Dataset Ownership (User B cannot access or delete User A's dataset)",
      `User B delete denied: success=${userBDeleteAttempt.data?.success}, User B history isolated: ${!userBHasDatasetA}`
    );
  }

  // 15. Landing page and navigation flow tests
  {
    // Test 15a: Root URL redirects unauthenticated visitors to landing.html
    const resRoot = await fetch(`${BASE_URL}/`, { redirect: 'manual' });
    const locationRoot = resRoot.headers.get('location');
    assert(
      resRoot.status === 302 && locationRoot === '/landing.html',
      'Test 15a: Root URL / Redirects to landing.html',
      `HTTP status: ${resRoot.status}, Location: ${locationRoot}`
    );

    // Test 15b: Unauthenticated /index.html access redirects to landing.html
    const resIndex = await fetch(`${BASE_URL}/index.html`, { redirect: 'manual' });
    const locationIndex = resIndex.headers.get('location');
    assert(
      resIndex.status === 302 && locationIndex === '/landing.html',
      'Test 15b: Direct /index.html Redirects Unauthenticated Users to landing.html',
      `HTTP status: ${resIndex.status}, Location: ${locationIndex}`
    );

    // Test 15c: GET /api/logout redirects to landing.html
    const resLogoutGet = await fetch(`${BASE_URL}/api/logout`, { redirect: 'manual' });
    const locationLogout = resLogoutGet.headers.get('location');
    assert(
      resLogoutGet.status === 302 && locationLogout === '/landing.html',
      'Test 15c: GET Logout Redirects to landing.html',
      `HTTP status: ${resLogoutGet.status}, Location: ${locationLogout}`
    );

    // Test 15d: Public landing.html is accessible and contains required sections
    const resLanding = await fetch(`${BASE_URL}/landing.html`);
    const landingHtml = await resLanding.text();
    const hasBranding = landingHtml.includes('DataLens') && landingHtml.includes('Comprehensive Dataset Profiling');
    const hasNavSections = landingHtml.includes('how-it-works') && landingHtml.includes('features') && landingHtml.includes('about');
    const hasAuthLinks = landingHtml.includes('login.html') && landingHtml.includes('register.html');
    const hasNoFakeStats = !landingHtml.includes('40,000') && !landingHtml.includes('98.5%');
    assert(
      resLanding.status === 200 && hasBranding && hasNavSections && hasAuthLinks && hasNoFakeStats,
      'Test 15d: landing.html Serves Public Sections & Valid Links Without Fake Live Stats',
      `HTTP 200 OK, branding=${hasBranding}, sections=${hasNavSections}, noFakeStats=${hasNoFakeStats}`
    );

    // Test 15e: Dashboard sidebar has removed copyright footer
    const fs = await import('fs');
    const indexContent = fs.readFileSync('index.html', 'utf-8');
    const hasNoCopyright = !indexContent.includes('© 2024 DataLens') && !indexContent.includes('&copy; 2024 DataLens') && !indexContent.includes('All rights reserved');
    assert(
      hasNoCopyright,
      'Test 15e: Dashboard Sidebar Footer Copyright Removed',
      `Copyright text removed from index.html: ${hasNoCopyright}`
    );
  }

  console.log(`\n========================================`);
  console.log(`Test Execution Summary:`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log(`TOTAL:  ${passedCount + failedCount}`);
  console.log(`========================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
