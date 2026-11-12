package com.datalens.controller;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import java.io.IOException;
import java.io.PrintWriter;

/**
 * DataLens — SessionServlet
 * Checks active HttpSession and returns current authenticated user state.
 */
@WebServlet(name = "SessionServlet", urlPatterns = {"/api/session", "/session"})
public class SessionServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        processRequest(request, response);
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        processRequest(request, response);
    }

    private void processRequest(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");
        PrintWriter out = response.getWriter();

        HttpSession session = request.getSession(false);
        Integer resolvedUserId = null;
        String resolvedName = "User";
        String resolvedEmail = "";

        if (session != null && session.getAttribute("userId") != null) {
            Object userId = session.getAttribute("userId");
            Object userName = session.getAttribute("userName");
            Object userEmail = session.getAttribute("userEmail");
            resolvedUserId = (userId instanceof Number) ? ((Number) userId).intValue() : Integer.parseInt(String.valueOf(userId));
            resolvedName = userName != null ? String.valueOf(userName) : "User";
            resolvedEmail = userEmail != null ? String.valueOf(userEmail) : "";
        } else {
            // Check token or sid from query params, headers, or cookies
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

            if (token != null && !token.trim().isEmpty()) {
                com.datalens.util.SessionRegistry.SessionData data = com.datalens.util.SessionRegistry.getSessionData(token);
                if (data != null) {
                    resolvedUserId = data.userId;
                    resolvedName = data.userName;
                    resolvedEmail = data.userEmail;

                    if (session == null) {
                        session = request.getSession(true);
                    }
                    session.setAttribute("userId", data.userId);
                    session.setAttribute("userName", data.userName);
                    session.setAttribute("userEmail", data.userEmail);
                }
            }
        }

        if (resolvedUserId != null) {
            String json = String.format(
                "{\"loggedIn\":true,\"user\":{\"id\":%d,\"name\":\"%s\",\"email\":\"%s\"}}",
                resolvedUserId,
                escapeJson(resolvedName),
                escapeJson(resolvedEmail)
            );
            response.setStatus(HttpServletResponse.SC_OK);
            out.print(json);
        } else {
            response.setStatus(HttpServletResponse.SC_OK);
            out.print("{\"loggedIn\":false}");
        }
        out.flush();
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
