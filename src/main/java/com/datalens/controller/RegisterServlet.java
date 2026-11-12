package com.datalens.controller;

import com.datalens.dao.UserDAO;
import com.datalens.model.User;
import com.datalens.util.PasswordUtil;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * DataLens — RegisterServlet
 * Handles user registration, validates all fields, prevents duplicate email accounts,
 * securely hashes passwords using PBKDF2WithHmacSHA256, and stores user in MySQL.
 */
@WebServlet(name = "RegisterServlet", urlPatterns = {"/api/register", "/register"})
public class RegisterServlet extends HttpServlet {

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

        String fullName = null;
        String email = null;
        String password = null;
        String confirmPassword = null;

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
            fullName = extractJsonString(body, "fullName");
            if (fullName == null) fullName = extractJsonString(body, "name");
            email = extractJsonString(body, "email");
            password = extractJsonString(body, "password");
            confirmPassword = extractJsonString(body, "confirmPassword");
        } else {
            fullName = request.getParameter("fullName");
            if (fullName == null) fullName = request.getParameter("name");
            email = request.getParameter("email");
            password = request.getParameter("password");
            confirmPassword = request.getParameter("confirmPassword");
        }

        // 1. Validate empty fields
        if (fullName == null || fullName.trim().isEmpty()) {
            sendJson(response, out, false, "Please enter your full name.");
            return;
        }

        if (email == null || email.trim().isEmpty()) {
            sendJson(response, out, false, "Please enter your email address.");
            return;
        }

        String cleanEmail = email.trim().toLowerCase();

        // 2. Validate email format
        if (!isValidEmail(cleanEmail)) {
            sendJson(response, out, false, "Please enter a valid email address.");
            return;
        }

        // 3. Validate password presence and minimum length
        if (password == null || password.isEmpty()) {
            sendJson(response, out, false, "Please enter a password.");
            return;
        }

        if (password.length() < 6) {
            sendJson(response, out, false, "Password must be at least 6 characters long.");
            return;
        }

        // 4. Validate password confirmation if provided
        if (confirmPassword != null && !password.equals(confirmPassword)) {
            sendJson(response, out, false, "Passwords do not match. Please re-enter.");
            return;
        }

        // 5. Check duplicate email
        if (userDAO.emailExists(cleanEmail)) {
            sendJson(response, out, false, "An account with this email already exists. Please sign in or use another email.");
            return;
        }

        // 6. Cryptographically hash password using PBKDF2WithHmacSHA256
        String passwordHash = PasswordUtil.hashPassword(password);

        User newUser = new User(fullName.trim(), cleanEmail, passwordHash);
        boolean saved = userDAO.registerUser(newUser);

        if (saved) {
            sendJson(response, out, true, "Account created successfully! Please sign in.");
        } else {
            if (userDAO.emailExists(cleanEmail)) {
                sendJson(response, out, false, "An account with this email already exists. Please sign in or use another email.");
            } else {
                sendJson(response, out, false, "Failed to create account. Please try again.");
            }
        }
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        response.sendRedirect(request.getContextPath() + "/register.html");
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
