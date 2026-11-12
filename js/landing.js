/**
 * DataLens — Public Landing Page Script (Vanilla JS ES6+)
 * Provides smooth navigation, mobile menu handling, and subtle header transitions.
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    initHeaderScroll();
    initMobileMenu();
    initSmoothScroll();
    checkAuthenticatedState();
  });

  /**
   * Adds elevation shadow to header on scroll
   */
  function initHeaderScroll() {
    const header = document.getElementById('header');
    if (!header) return;

    window.addEventListener('scroll', () => {
      if (window.scrollY > 20) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  /**
   * Mobile menu toggle functionality
   */
  function initMobileMenu() {
    const toggle = document.getElementById('mobile-toggle');
    const navMenu = document.getElementById('nav-menu');
    if (!toggle || !navMenu) return;

    toggle.addEventListener('click', () => {
      const isVisible = navMenu.style.display === 'flex';
      navMenu.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        navMenu.style.flexDirection = 'column';
        navMenu.style.position = 'absolute';
        navMenu.style.top = 'var(--header-height)';
        navMenu.style.left = '0';
        navMenu.style.right = '0';
        navMenu.style.background = '#ffffff';
        navMenu.style.padding = '20px';
        navMenu.style.borderBottom = '1px solid #e2e8f0';
        navMenu.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
      }
    });

    // Close menu when clicking any nav link
    const links = navMenu.querySelectorAll('a');
    links.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          navMenu.style.display = 'none';
        }
      });
    });
  }

  /**
   * Smooth scroll with offset for sticky header
   */
  function initSmoothScroll() {
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (!targetId || targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          e.preventDefault();
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });
  }

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
   * Checks session status to optionally update CTA to "Go to Dashboard" if user is already authenticated
   */
  async function checkAuthenticatedState() {
    try {
      const token = sessionStorage.getItem('datalens_session_id') || localStorage.getItem('datalens_session_id');
      const headers = token ? { 'Authorization': 'Bearer ' + token, 'X-Session-ID': token } : {};
      const primaryUrl = getApiUrl('/api/session');
      const fallbackUrl = getApiUrl('/session');
      const res = await fetch(primaryUrl, { headers, credentials: 'include' })
        .catch(() => fetch(fallbackUrl, { headers, credentials: 'include' }));
      
      if (res && res.ok) {
        const data = await res.json();
        if (data && data.loggedIn) {
          const btnSignIn = document.getElementById('nav-btn-signin');
          const btnGetStarted = document.getElementById('nav-btn-getstarted');
          const targetUrl = token ? `index.html?sid=${encodeURIComponent(token)}` : 'index.html';
          if (btnSignIn) {
            btnSignIn.textContent = 'Dashboard';
            btnSignIn.href = targetUrl;
          }
          if (btnGetStarted) {
            btnGetStarted.textContent = 'Go to Dashboard';
            btnGetStarted.href = targetUrl;
          }
        }
      }
    } catch (e) {
      // Keep standard login links
    }
  }

})();
