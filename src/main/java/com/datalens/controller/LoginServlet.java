package com.datalens.controller;

import com.datalens.dao.UserDAO;
import com.datalens.model.User;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * DataLens — LoginServlet
 * Handles user authentication against MySQL/UserDAO, strictly enforces
 * exact password verification, rotates session ID, and prevents account existence leaking.
 */
@WebServlet(name = "LoginServlet", urlPatterns = {"/api/login", "/login"})
public class LoginServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[a-zA-Z0-9_+&*-]+(?:\\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,7}$");
    private final UserDAO userDAO = new UserDAO();

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {

        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        response.setHeader("Pragma", "no-cache");
        response.setDateHeader("Expires", 0);

        PrintWriter out = response.getWriter();

        String email = null;
        String password = null;

        // Check if request is JSON or form parameter
        String contentType = request.getContentType();
        if (contentType != null && contentType.toLowerCase().contains("application/json")) {
            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = request.getReader()) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
            }
            String body = sb.toString();
            email = extractJsonString(body, "email");
            password = extractJsonString(body, "password");
        } else {
            email = request.getParameter("email");
            password = request.getParameter("password");
        }

        boolean emailEmpty = (email == null || email.trim().isEmpty());
        boolean passwordEmpty = (password == null || password.isEmpty());

        // 1. Required field validations
        if (emailEmpty && passwordEmpty) {
            sendJson(response, out, false, "Please enter your email and password.");
            return;
        }
        if (emailEmpty) {
            sendJson(response, out, false, "Please enter your email address.");
            return;
        }
        if (passwordEmpty) {
            sendJson(response, out, false, "Please enter your password.");
            return;
        }

        String cleanEmail = email.trim().toLowerCase();

        // 2. Email format validation
        if (!isValidEmail(cleanEmail)) {
            sendJson(response, out, false, "Please enter a valid email address.");
            return;
        }

        // 3. Exact password authentication (never trim password, never partial match, never reveal email existence)
        User user = userDAO.authenticate(cleanEmail, password);
        if (user == null) {
            sendJson(response, out, false, "Invalid email or password. Please try again.");
            return;
        }

        // 4. Rotate session ID on successful login (session fixation defense)
        HttpSession oldSession = request.getSession(false);
        if (oldSession != null) {
            oldSession.invalidate();
        }
        HttpSession session = request.getSession(true);
        session.setAttribute("userId", user.getId());
        session.setAttribute("userName", user.getFullName());
        session.setAttribute("userEmail", user.getEmail());

        // Register in SessionRegistry for token & query parameter resolution
        com.datalens.util.SessionRegistry.registerSession(
            session.getId(), user.getId(), user.getFullName(), user.getEmail(), session
        );

        // Set Lax session cookie header explicitly for cross-tab stability
        response.setHeader("Set-Cookie", "JSESSIONID=" + session.getId() + "; Path=/; HttpOnly; SameSite=Lax");

        // 5. Success response (never expose password hashes)
        String jsonResponse = String.format(
            "{\"success\":true,\"message\":\"Login successful\",\"sessionId\":\"%s\",\"token\":\"%s\",\"user\":{\"id\":%d,\"name\":\"%s\",\"email\":\"%s\"}}",
            session.getId(),
            session.getId(),
            user.getId(),
            escapeJson(user.getFullName()),
            escapeJson(user.getEmail())
        );

        response.setStatus(HttpServletResponse.SC_OK);
        out.print(jsonResponse);
        out.flush();
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        response.sendRedirect(request.getContextPath() + "/login.html");
    }

    private boolean isValidEmail(String email) {
        if (email == null || email.isEmpty()) return false;
        return EMAIL_PATTERN.matcher(email).matches();
    }

    private void sendJson(HttpServletResponse response, PrintWriter out, boolean success, String message) {
        response.setStatus(HttpServletResponse.SC_OK);
        String json = String.format("{\"success\":%b,\"message\":\"%s\"}", success, escapeJson(message));
        out.print(json);
        out.flush();
    }

    private String extractJsonString(String json, String key) {
        if (json == null) return null;
        Pattern p = Pattern.compile("\"" + key + "\"\\s*:\\s*\"([^\"]*)\"");
        Matcher m = p.matcher(json);
        if (m.find()) {
            return m.group(1);
        }
        return null;
    }

    private String escapeJson(String input) {
        if (input == null) return "";
        return input.replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\b", "\\b")
                    .replace("\f", "\\f")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                    .replace("\t", "\\t");
    }
}
