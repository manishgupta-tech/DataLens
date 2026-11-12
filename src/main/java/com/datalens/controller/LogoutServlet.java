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
 * DataLens — LogoutServlet
 * Invalidates the active HttpSession, sets no-cache headers, and logs the user out.
 */
@WebServlet(name = "LogoutServlet", urlPatterns = {"/api/logout", "/logout"})
public class LogoutServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        performLogout(request, response, false);
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        performLogout(request, response, true);
    }

    private void performLogout(HttpServletRequest request, HttpServletResponse response, boolean isGet)
            throws IOException {
        HttpSession session = request.getSession(false);
        if (session != null) {
            com.datalens.util.SessionRegistry.removeSession(session.getId());
            session.invalidate();
        }

        response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        response.setHeader("Pragma", "no-cache");
        response.setDateHeader("Expires", 0);

        String acceptHeader = request.getHeader("Accept");
        boolean wantsJson = acceptHeader != null && acceptHeader.contains("application/json");

        if (isGet && !wantsJson) {
            response.sendRedirect(request.getContextPath() + "/landing.html");
            return;
        }

        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");
        PrintWriter out = response.getWriter();
        response.setStatus(HttpServletResponse.SC_OK);
        out.print("{\"success\":true,\"message\":\"Logged out successfully\"}");
        out.flush();
    }
}
