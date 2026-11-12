package com.datalens.controller;

import com.datalens.model.AnalysisResult;
import com.datalens.model.Dataset;
import com.datalens.service.DatasetManager;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import jakarta.servlet.http.HttpSession;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.List;

/**
 * DataLens — InsightsServlet
 * Emits rule-based observations and data quality evaluations without AI/external APIs.
 */
@WebServlet(name = "InsightsServlet", urlPatterns = {"/api/insights", "/insights"})
public class InsightsServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {

        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");

        PrintWriter out = response.getWriter();

        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;

        DatasetManager dm = DatasetManager.getInstance();
        Dataset dataset = dm.getActiveDataset(userId);
        AnalysisResult analysis = dm.getActiveAnalysisResult(userId);

        if (dataset == null || analysis == null) {
            out.print("{\"success\":false,\"hasDataset\":false,\"message\":\"No active dataset loaded.\"}");
            out.flush();
            return;
        }

        List<String> insights = analysis.getRuleInsights();

        String healthRating;
        if (dataset.getQualityScore() >= 90) {
            healthRating = "Excellent";
        } else if (dataset.getQualityScore() >= 75) {
            healthRating = "Good";
        } else if (dataset.getQualityScore() >= 60) {
            healthRating = "Fair";
        } else {
            healthRating = "Needs Attention";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"success\":true,");
        sb.append("\"hasDataset\":true,");
        sb.append("\"datasetName\":\"").append(escapeJson(dataset.getOriginalName())).append("\",");
        sb.append("\"qualityScore\":").append(dataset.getQualityScore()).append(",");
        sb.append("\"healthRating\":\"").append(healthRating).append("\",");

        // Insights list
        sb.append("\"insights\":[");
        for (int i = 0; i < insights.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(escapeJson(insights.get(i))).append("\"");
        }
        sb.append("]");

        sb.append("}");

        out.print(sb.toString());
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
