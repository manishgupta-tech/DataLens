package com.datalens.filter;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.FilterConfig;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import java.io.IOException;

/**
 * DataLens — AuthenticationFilter
 * Intercepts requests and ensures user is authenticated before allowing access to protected endpoints and dashboard.
 * Sets strict cache-control headers to prevent browser back or refresh from restoring protected pages.
 */
@WebFilter(filterName = "AuthenticationFilter", urlPatterns = {"/*"})
public class AuthenticationFilter implements Filter {

    @Override
    public void init(FilterConfig filterConfig) throws ServletException {
    }

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        // Set cache prevention headers to ensure browser Back/refresh does not restore cached session pages
        response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        response.setHeader("Pragma", "no-cache");
        response.setDateHeader("Expires", 0);

        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        String relativePath = path.startsWith(contextPath) ? path.substring(contextPath.length()) : path;

        // Clean trailing query strings or slashes for matching
        String cleanPath = relativePath;
        int queryIdx = cleanPath.indexOf('?');
        if (queryIdx >= 0) {
            cleanPath = cleanPath.substring(0, queryIdx);
        }

        // Allow public static resources
        if (cleanPath.startsWith("/css/") ||
            cleanPath.startsWith("/js/") ||
            cleanPath.startsWith("/assets/") ||
            cleanPath.endsWith(".css") ||
            cleanPath.endsWith(".js") ||
            cleanPath.endsWith(".ico") ||
            cleanPath.endsWith(".png") ||
            cleanPath.endsWith(".jpg") ||
            cleanPath.endsWith(".jpeg") ||
            cleanPath.endsWith(".svg") ||
            cleanPath.endsWith(".woff") ||
            cleanPath.endsWith(".woff2") ||
            cleanPath.endsWith(".ttf")) {
            chain.doFilter(req, res);
            return;
        }

        // Allow public pages and auth endpoints
        if (cleanPath.equals("/landing.html") ||
            cleanPath.equals("/login.html") ||
            cleanPath.equals("/register.html") ||
            cleanPath.equals("/api/login") || cleanPath.equals("/login") ||
            cleanPath.equals("/api/register") || cleanPath.equals("/register") ||
            cleanPath.equals("/api/session") || cleanPath.equals("/session") ||
            cleanPath.equals("/api/logout") || cleanPath.equals("/logout")) {
            chain.doFilter(req, res);
            return;
        }

        // Check active session
        HttpSession session = request.getSession(false);
        boolean isLoggedIn = (session != null && session.getAttribute("userId") != null);

        // If not logged in via standard cookie session, inspect query parameters, headers, and cookies
        if (!isLoggedIn) {
            String token = request.getParameter("token");
            if (token == null) token = request.getParameter("sid");
            if (token == null) token = request.getParameter("sessionId");
            if (token == null) {
                String auth = request.getHeader("Authorization");
                if (auth != null && auth.startsWith("Bearer ")) {
                    token = auth.substring(7).trim();
                }
            }
            if (token == null) {
                token = request.getHeader("X-Session-ID");
            }
            if (token == null && request.getCookies() != null) {
                for (jakarta.servlet.http.Cookie c : request.getCookies()) {
                    if ("JSESSIONID".equalsIgnoreCase(c.getName()) || "datalens_session".equalsIgnoreCase(c.getName())) {
                        token = c.getValue();
                        break;
                    }
                }
            }

            if (token != null && !token.trim().isEmpty()) {
                com.datalens.util.SessionRegistry.SessionData data = com.datalens.util.SessionRegistry.getSessionData(token);
                if (data != null) {
                    if (session == null) {
                        session = request.getSession(true);
                    }
                    session.setAttribute("userId", data.userId);
                    session.setAttribute("userName", data.userName);
                    session.setAttribute("userEmail", data.userEmail);
                    isLoggedIn = true;
                }
            }
        }

        // Root path navigation: unauthenticated visitors go to landing.html
        if (cleanPath.equals("") || cleanPath.equals("/")) {
            if (!isLoggedIn) {
                response.sendRedirect(contextPath + "/landing.html");
                return;
            } else {
                response.sendRedirect(contextPath + "/index.html");
                return;
            }
        }

        // Protect HTML Dashboard
        if (cleanPath.equals("/index.html")) {
            if (!isLoggedIn) {
                response.sendRedirect(contextPath + "/landing.html");
                return;
            }
            chain.doFilter(req, res);
            return;
        }

        // Protect API and data endpoints: return HTTP 401 JSON
        if (!isLoggedIn) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().print("{\"success\":false,\"loggedIn\":false,\"message\":\"Please login first\"}");
            response.getWriter().flush();
            return;
        }

        chain.doFilter(req, res);
    }

    @Override
    public void destroy() {
    }
}
