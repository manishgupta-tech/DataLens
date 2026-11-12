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
import java.util.List;

/**
 * DataLens — QualityServlet
 * Serves comprehensive data quality metrics, completeness assessments,
 * duplicate analysis, and column-by-column health scores.
 */
@WebServlet(name = "QualityServlet", urlPatterns = {"/api/quality", "/quality"})
public class QualityServlet extends HttpServlet {

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

        long totalCells = (long) dataset.getRowCount() * dataset.getColumnCount();
        double missingPct = totalCells > 0 ? (dataset.getMissingCount() * 100.0 / totalCells) : 0.0;
        double duplicatePct = dataset.getRowCount() > 0 ? (dataset.getDuplicateCount() * 100.0 / dataset.getRowCount()) : 0.0;

        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"success\":true,");
        sb.append("\"hasDataset\":true,");
        sb.append("\"datasetName\":\"").append(escapeJson(dataset.getOriginalName())).append("\",");

        // Quality Summary Metrics
        sb.append("\"metrics\":{");
        sb.append("\"totalRows\":").append(dataset.getRowCount()).append(",");
        sb.append("\"totalColumns\":").append(dataset.getColumnCount()).append(",");
        sb.append("\"totalCells\":").append(totalCells).append(",");
        sb.append("\"missingValues\":").append(dataset.getMissingCount()).append(",");
        sb.append("\"missingPercentage\":").append(round2(missingPct)).append(",");
        sb.append("\"duplicateRows\":").append(dataset.getDuplicateCount()).append(",");
        sb.append("\"duplicatePercentage\":").append(round2(duplicatePct)).append(",");
        sb.append("\"qualityScore\":").append(dataset.getQualityScore());
        sb.append("},");

        // Quality Dimensions
        sb.append("\"dimensions\":{");
        sb.append("\"completeness\":").append(analysis.getCompletenessScore()).append(",");
        sb.append("\"uniqueness\":").append(analysis.getUniquenessScore()).append(",");
        sb.append("\"consistency\":").append(analysis.getConsistencyScore()).append(",");
        sb.append("\"validity\":").append(analysis.getValidityScore()).append(",");
        sb.append("\"timeliness\":").append(analysis.getTimelinessScore()).append(",");
        sb.append("\"overallScore\":").append(analysis.getOverallQualityScore());
        sb.append("},");

        // Deductions & Score Breakdown
        sb.append("\"deductions\":{");
        sb.append("\"missingDeduction\":").append(analysis.getMissingDeduction()).append(",");
        sb.append("\"duplicateDeduction\":").append(analysis.getDuplicateDeduction()).append(",");
        sb.append("\"finalScore\":").append(analysis.getOverallQualityScore());
        sb.append("},");

        // Column-Level Assessment
        sb.append("\"columns\":[");
        List<ColumnMetadata> cols = analysis.getColumns();
        for (int i = 0; i < cols.size(); i++) {
            if (i > 0) sb.append(",");
            ColumnMetadata c = cols.get(i);
            sb.append("{");
            sb.append("\"name\":\"").append(escapeJson(c.getName())).append("\",");
            sb.append("\"type\":\"").append(c.getType()).append("\",");
            sb.append("\"totalValues\":").append(c.getTotalValues()).append(",");
            sb.append("\"missingCount\":").append(c.getMissingCount()).append(",");
            sb.append("\"missingPercentage\":").append(c.getMissingPercentage()).append(",");
            sb.append("\"uniqueCount\":").append(c.getUniqueCount()).append(",");
            sb.append("\"completenessPercentage\":").append(c.getCompletenessPercentage()).append(",");
            sb.append("\"cardinalityPercentage\":").append(c.getCardinalityPercentage()).append(",");
            sb.append("\"isConstant\":").append(c.isConstant()).append(",");
            sb.append("\"healthStatus\":\"").append(c.getHealthStatus()).append("\"");
            sb.append("}");
        }
        sb.append("],");

        // Discrete Quality Issues Inventory
        sb.append("\"issues\":[");
        List<com.datalens.model.QualityIssue> issues = analysis.getIssues();
        if (issues != null) {
            for (int i = 0; i < issues.size(); i++) {
                if (i > 0) sb.append(",");
                com.datalens.model.QualityIssue qi = issues.get(i);
                sb.append("{");
                sb.append("\"id\":\"").append(qi.getId()).append("\",");
                sb.append("\"severity\":\"").append(qi.getSeverity()).append("\",");
                sb.append("\"type\":\"").append(qi.getType()).append("\",");
                sb.append("\"columnName\":\"").append(escapeJson(qi.getColumnName())).append("\",");
                sb.append("\"affectedRowsCount\":").append(qi.getAffectedRowsCount()).append(",");
                sb.append("\"affectedPercentage\":").append(qi.getAffectedPercentage()).append(",");
                sb.append("\"explanation\":\"").append(escapeJson(qi.getExplanation())).append("\",");
                sb.append("\"recommendation\":\"").append(escapeJson(qi.getRecommendation())).append("\",");
                sb.append("\"exampleRowNumbers\":[");
                List<Integer> rNums = qi.getExampleRowNumbers();
                if (rNums != null) {
                    for (int j = 0; j < rNums.size(); j++) {
                        if (j > 0) sb.append(",");
                        sb.append(rNums.get(j));
                    }
                }
                sb.append("]");
                sb.append("}");
            }
        }
        sb.append("]");

        sb.append("}");

        out.print(sb.toString());
        out.flush();
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
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
