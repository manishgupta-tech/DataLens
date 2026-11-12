package com.datalens.controller;

import com.datalens.model.AnalysisResult;
import com.datalens.model.ColumnMetadata;
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
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;

/**
 * DataLens — DashboardServlet
 * Returns overview metrics, quality summary, preview rows, and dataset metadata for the active dataset.
 */
@WebServlet(name = "DashboardServlet", urlPatterns = {"/api/dashboard", "/dashboard"})
public class DashboardServlet extends HttpServlet {

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
            out.print("{\"success\":false,\"hasDataset\":false,\"message\":\"No active dataset loaded. Please upload a CSV file.\"}");
            out.flush();
            return;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"success\":true,");
        sb.append("\"hasDataset\":true,");

        // Metrics
        sb.append("\"metrics\":{");
        sb.append("\"totalRows\":").append(dataset.getRowCount()).append(",");
        sb.append("\"totalColumns\":").append(dataset.getColumnCount()).append(",");
        sb.append("\"numericColumns\":").append(dataset.getNumericCount()).append(",");
        sb.append("\"categoricalColumns\":").append(dataset.getCategoricalCount()).append(",");
        sb.append("\"missingValues\":").append(dataset.getMissingCount()).append(",");
        sb.append("\"duplicateRows\":").append(dataset.getDuplicateCount()).append(",");
        sb.append("\"qualityScore\":").append(dataset.getQualityScore());
        sb.append("},");

        // Dataset Info
        sb.append("\"datasetInfo\":{");
        sb.append("\"id\":").append(dataset.getId()).append(",");
        sb.append("\"fileName\":\"").append(escapeJson(dataset.getOriginalName())).append("\",");
        sb.append("\"storedFileName\":\"").append(escapeJson(dataset.getStoredName())).append("\",");
        sb.append("\"fileSize\":").append(dataset.getFileSize()).append(",");
        sb.append("\"fileSizeFormatted\":\"").append(formatFileSize(dataset.getFileSize())).append("\",");
        sb.append("\"uploadTime\":").append(dataset.getUploadTime()).append(",");
        sb.append("\"uploadDateFormatted\":\"").append(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date(dataset.getUploadTime()))).append("\",");
        sb.append("\"delimiter\":\",\",");
        sb.append("\"encoding\":\"UTF-8\"");
        sb.append("},");

        // Quality Dimensions
        sb.append("\"qualityOverview\":{");
        sb.append("\"completeness\":").append(analysis.getCompletenessScore()).append(",");
        sb.append("\"uniqueness\":").append(analysis.getUniquenessScore()).append(",");
        sb.append("\"consistency\":").append(analysis.getConsistencyScore()).append(",");
        sb.append("\"validity\":").append(analysis.getValidityScore()).append(",");
        sb.append("\"timeliness\":").append(analysis.getTimelinessScore()).append(",");
        sb.append("\"overallScore\":").append(analysis.getOverallQualityScore()).append(",");
        sb.append("\"missingDeduction\":").append(analysis.getMissingDeduction()).append(",");
        sb.append("\"duplicateDeduction\":").append(analysis.getDuplicateDeduction());
        sb.append("},");

        // Headers
        sb.append("\"headers\":[");
        List<String> headers = analysis.getHeaders();
        for (int i = 0; i < headers.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(escapeJson(headers.get(i))).append("\"");
        }
        sb.append("],");

        // First 5 Preview Rows
        sb.append("\"previewRows\":[");
        List<List<String>> previewRows = analysis.getPreviewRows();
        for (int i = 0; i < previewRows.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("[");
            List<String> row = previewRows.get(i);
            for (int j = 0; j < row.size(); j++) {
                if (j > 0) sb.append(",");
                sb.append("\"").append(escapeJson(row.get(j))).append("\"");
            }
            sb.append("]");
        }
        sb.append("],");

        // Columns summary
        sb.append("\"columns\":[");
        List<ColumnMetadata> cols = analysis.getColumns();
        for (int i = 0; i < cols.size(); i++) {
            if (i > 0) sb.append(",");
            ColumnMetadata c = cols.get(i);
            sb.append("{");
            sb.append("\"name\":\"").append(escapeJson(c.getName())).append("\",");
            sb.append("\"type\":\"").append(c.getType()).append("\",");
            sb.append("\"missingCount\":").append(c.getMissingCount()).append(",");
            sb.append("\"missingPercentage\":").append(c.getMissingPercentage()).append(",");
            sb.append("\"uniqueCount\":").append(c.getUniqueCount()).append(",");
            sb.append("\"completenessPercentage\":").append(c.getCompletenessPercentage()).append(",");
            sb.append("\"healthStatus\":\"").append(c.getHealthStatus()).append("\"");
            sb.append("}");
        }
        sb.append("],");

        // Rule Insights (Top 4)
        sb.append("\"insights\":[");
        List<String> insights = analysis.getRuleInsights();
        for (int i = 0; i < Math.min(4, insights.size()); i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(escapeJson(insights.get(i))).append("\"");
        }
        sb.append("]");

        sb.append("}");

        out.print(sb.toString());
        out.flush();
    }

    private String formatFileSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        return String.format("%.2f MB", bytes / (1024.0 * 1024.0));
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
