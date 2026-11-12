/**
 * DataLens — Authentication Script (Vanilla JavaScript)
 * Handles Login, Registration, Password Toggle, Input Validation, and Session Redirection.
 * Fully compatible with Apache Tomcat 10.1 context paths (e.g. /datalens/).
 */

document.addEventListener('DOMContentLoaded', () => {
  initSessionCheck();
  initPasswordToggle();
  initUrlParamsNotice();
  initLoginForm();
  initRegisterForm();
});

/**
 * Resolves API endpoint URL respecting deployed Tomcat context path (e.g., /datalens/api/...)
 * Works seamlessly whether deployed under /datalens/ or at root /
 * @param {string} endpoint
 * @returns {string}
 */
function getApiUrl(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  const path = window.location.pathname || '';
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 0 && segments[0] !== 'api' && !segments[0].includes('.')) {
    return '/' + segments[0] + cleanEndpoint;
  }
  return cleanEndpoint;
}

/**
 * Checks if user is already authenticated. If so, redirects immediately to index.html.
 */
async function initSessionCheck() {
  try {
    const token = sessionStorage.getItem('datalens_session_id') || localStorage.getItem('datalens_session_id');
    const headers = token ? { 'Authorization': 'Bearer ' + token, 'X-Session-ID': token } : {};
    const primaryUrl = getApiUrl('/api/session');
    const fallbackUrl = getApiUrl('/session');

    let res = await fetch(primaryUrl, { headers, credentials: 'include' })
      .catch(() => fetch(fallbackUrl, { headers, credentials: 'include' }))
      .catch(() => null);

    if (res && res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json().catch(() => null);
        if (data && data.loggedIn) {
          const sid = token || '';
          window.location.href = sid ? `index.html?sid=${encodeURIComponent(sid)}` : 'index.html';
        }
      }
    }
  } catch (err) {
    // Session check error, ignore and let user stay on auth screen
  }
}

/**
 * Checks URL parameters for status messages (e.g., ?registered=true or ?sessionExpired=true).
 */
function initUrlParamsNotice() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('registered') === 'true') {
    showAlert('Account created successfully! Please sign in.', 'success');
  } else if (urlParams.get('sessionExpired') === 'true') {
    showAlert('Your session has expired. Please sign in again.', 'error');
  } else if (urlParams.get('loggedOut') === 'true') {
    showAlert('You have been logged out successfully.', 'success');
  }
}

/**
 * Initializes eye icon toggle for password fields.
 */
function initPasswordToggle() {
  const toggleBtn = document.getElementById('toggle-pwd-btn');
  const pwdInput = document.getElementById('password');
  if (!toggleBtn || !pwdInput) return;

  toggleBtn.addEventListener('click', () => {
    const isPassword = pwdInput.type === 'password';
    pwdInput.type = isPassword ? 'text' : 'password';

    if (isPassword) {
      toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
          <line x1="2" x2="22" y1="2" y2="22"/>
        </svg>
      `;
    } else {
      toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      `;
    }
  });
}

/**
 * Handles login form submission with strict input validation.
 */
function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  const btnLogin = document.getElementById('btn-login');
  const btnLoginText = document.getElementById('btn-login-text');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const email = emailInput ? emailInput.value.trim() : '';
    // Exact password value without trimming
    const password = passwordInput ? passwordInput.value : '';

    // 1. Both fields empty
    if (!email && !password) {
      showAlert('Please enter your email and password.', 'error');
      if (emailInput) emailInput.focus();
      return;
    }

    // 2. Email empty
    if (!email) {
      showAlert('Please enter your email address.', 'error');
      if (emailInput) emailInput.focus();
      return;
    }

    // 3. Password empty
    if (!password) {
      showAlert('Please enter your password.', 'error');
      if (passwordInput) passwordInput.focus();
      return;
    }

    // 4. Invalid email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAlert('Please enter a valid email address.', 'error');
      if (emailInput) emailInput.focus();
      return;
    }

    // Set loading state & disable submit button to prevent duplicate submissions
    setButtonLoading(btnLogin, btnLoginText, true, 'Signing In...');
    hideAlert();

    const targetUrl = getApiUrl('/api/login');
    const fallbackUrl = getApiUrl('/login');
    const payload = JSON.stringify({ email, password });

    try {
      let response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: payload,
        credentials: 'include'
      }).catch(() => null);

      if (!response || response.status === 404) {
        response = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: payload,
          credentials: 'include'
        }).catch(() => null);
      }

      if (!response) {
        showAlert('Cannot connect to authentication service. Please verify Tomcat is running.', 'error');
        setButtonLoading(btnLogin, btnLoginText, false, 'Sign In');
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      let result = null;

      if (contentType.includes('application/json')) {
        try {
          result = await response.json();
        } catch (e) {
          result = null;
        }
      }

      if (response.ok && result && result.success) {
        if (result.sessionId || result.token) {
          const token = result.sessionId || result.token;
          sessionStorage.setItem('datalens_session_id', token);
          localStorage.setItem('datalens_session_id', token);
          if (result.user) {
            sessionStorage.setItem('datalens_user', JSON.stringify(result.user));
            localStorage.setItem('datalens_user', JSON.stringify(result.user));
          }
        }
        showAlert('Login successful! Opening dashboard...', 'success');
        setTimeout(() => {
          const sid = result.sessionId || result.token;
          if (sid) {
            window.location.href = 'index.html?sid=' + encodeURIComponent(sid);
          } else {
            window.location.href = 'index.html';
          }
        }, 300);
      } else if (result && result.message) {
        showAlert(result.message, 'error');
        setButtonLoading(btnLogin, btnLoginText, false, 'Sign In');
      } else if (response.status === 401) {
        showAlert('Invalid email or password. Please try again.', 'error');
        setButtonLoading(btnLogin, btnLoginText, false, 'Sign In');
      } else if (response.status === 404) {
        showAlert('Login service not found (HTTP 404). Please ensure the DataLens backend WAR is compiled and deployed in Tomcat.', 'error');
        setButtonLoading(btnLogin, btnLoginText, false, 'Sign In');
      } else {
        showAlert(`Login failed (HTTP ${response.status}). Please try again.`, 'error');
        setButtonLoading(btnLogin, btnLoginText, false, 'Sign In');
      }
    } catch (err) {
      showAlert('Unexpected error during sign in. Please try again.', 'error');
      setButtonLoading(btnLogin, btnLoginText, false, 'Sign In');
    }
  });
}

/**
 * Handles registration form submission with strict input validation.
 */
function initRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;

  const btnRegister = document.getElementById('btn-register');
  const btnRegisterText = document.getElementById('btn-register-text');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    const fullName = fullNameInput ? fullNameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    // Untrimmed passwords
    const password = passwordInput ? passwordInput.value : '';
    const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';

    if (!fullName) {
      showAlert('Please enter your full name.', 'error');
      if (fullNameInput) fullNameInput.focus();
      return;
    }

    if (!email) {
      showAlert('Please enter your email address.', 'error');
      if (emailInput) emailInput.focus();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAlert('Please enter a valid email address.', 'error');
      if (emailInput) emailInput.focus();
      return;
    }

    if (!password) {
      showAlert('Please enter a password.', 'error');
      if (passwordInput) passwordInput.focus();
      return;
    }

    if (password.length < 6) {
      showAlert('Password must be at least 6 characters long.', 'error');
      if (passwordInput) passwordInput.focus();
      return;
    }

    if (!confirmPassword || password !== confirmPassword) {
      showAlert('Passwords do not match. Please re-enter.', 'error');
      if (confirmPasswordInput) confirmPasswordInput.focus();
      return;
    }

    // Set loading state & disable submit button to prevent duplicate submissions
    setButtonLoading(btnRegister, btnRegisterText, true, 'Creating Account...');
    hideAlert();

    const targetUrl = getApiUrl('/api/register');
    const fallbackUrl = getApiUrl('/register');
    const payload = JSON.stringify({ fullName, email, password, confirmPassword });

    try {
      let response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: payload,
        credentials: 'include'
      }).catch(() => null);

      if (!response || response.status === 404) {
        response = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: payload,
          credentials: 'include'
        }).catch(() => null);
      }

      if (!response) {
        showAlert('Cannot connect to registration service. Please verify Tomcat is running.', 'error');
        setButtonLoading(btnRegister, btnRegisterText, false, 'Create Account');
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      let result = null;

      if (contentType.includes('application/json')) {
        try {
          result = await response.json();
        } catch (e) {
          result = null;
        }
      }

      if (response.ok && result && result.success) {
        showAlert('Account created successfully! Redirecting to login...', 'success');
        setTimeout(() => {
          window.location.href = 'login.html?registered=true';
        }, 500);
      } else if (result && result.message) {
        showAlert(result.message, 'error');
        setButtonLoading(btnRegister, btnRegisterText, false, 'Create Account');
      } else if (response.status === 404) {
        showAlert('Registration service not found (HTTP 404). Please ensure the DataLens backend WAR is compiled and deployed in Tomcat.', 'error');
        setButtonLoading(btnRegister, btnRegisterText, false, 'Create Account');
      } else if (response.status === 500) {
        showAlert('Server error during registration (HTTP 500). Please check Tomcat logs.', 'error');
        setButtonLoading(btnRegister, btnRegisterText, false, 'Create Account');
      } else {
        showAlert(`Registration failed (HTTP ${response.status}). Please try again.`, 'error');
        setButtonLoading(btnRegister, btnRegisterText, false, 'Create Account');
      }
    } catch (err) {
      showAlert('Unexpected error during registration. Please check your network and try again.', 'error');
      setButtonLoading(btnRegister, btnRegisterText, false, 'Create Account');
    }
  });
}

/**
 * Displays an alert message on the auth form.
 * @param {string} message 
 * @param {'error'|'success'} type 
 */
function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('auth-alert');
  const alertText = document.getElementById('auth-alert-text');
  if (!alertBox || !alertText) return;

  alertBox.className = `auth-alert show ${type}`;
  alertText.textContent = message;
}

/**
 * Hides the alert message box.
 */
function hideAlert() {
  const alertBox = document.getElementById('auth-alert');
  if (alertBox) {
    alertBox.className = 'auth-alert';
  }
}

/**
 * Sets button loading / enabled state.
 */
function setButtonLoading(button, textElement, isLoading, text) {
  if (!button) return;
  button.disabled = isLoading;
  if (isLoading) {
    button.innerHTML = `<span class="spinner"></span> <span>${text}</span>`;
  } else {
    button.innerHTML = `<span>${text}</span>`;
  }
}
