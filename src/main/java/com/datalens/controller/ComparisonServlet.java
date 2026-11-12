package com.datalens.controller;

import com.datalens.model.Dataset;
import com.datalens.model.VersionComparisonResult;
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
import java.util.Map;

/**
 * DataLens — ComparisonServlet
 * Compares two dataset versions with exact metrics deltas, lineage classification,
 * record-level turnover, schema evolution, numeric shifts, and executive verdict.
 */
@WebServlet(name = "ComparisonServlet", urlPatterns = {"/api/comparison", "/api/comparison/versions"})
public class ComparisonServlet extends HttpServlet {

    private static final long serialVersionUID = 2L;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {

        response.setContentType("application/json;charset=UTF-8");
        PrintWriter out = response.getWriter();

        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;
        DatasetManager dm = DatasetManager.getInstance();

        String path = request.getRequestURI();

        if (path.endsWith("/versions")) {
            List<Dataset> versions = dm.getDatasetVersions(userId);
            out.print("{\"success\":true,\"versions\":[");
            for (int i = 0; i < versions.size(); i++) {
                if (i > 0) out.print(",");
                Dataset d = versions.get(i);
                String name = d.getOriginalName();
                String family = name != null ? name.replaceAll("^(v\\d+_|cleaned_)", "").trim() : "Unknown";
                boolean isCleaned = name != null && (name.startsWith("cleaned_") || name.matches("^v\\d+_.*"));
                out.print("{");
                out.print("\"id\":" + d.getId() + ",");
                out.print("\"name\":\"" + escapeJson(name) + "\",");
                out.print("\"datasetFamily\":\"" + escapeJson(family) + "\",");
                out.print("\"isCleanedVersion\":" + isCleaned + ",");
                out.print("\"rowCount\":" + d.getRowCount() + ",");
                out.print("\"columnCount\":" + d.getColumnCount() + ",");
                out.print("\"qualityScore\":" + d.getQualityScore() + ",");
                out.print("\"uploadTime\":" + d.getUploadTime());
                out.print("}");
            }
            out.print("]}");
            out.flush();
            return;
        }

        String baseStr = request.getParameter("baseId");
        String targetStr = request.getParameter("targetId");

        if (baseStr == null || targetStr == null) {
            out.print("{\"success\":false,\"message\":\"Please specify baseId and targetId parameters.\"}");
            out.flush();
            return;
        }

        int baseId;
        int targetId;
        try {
            baseId = Integer.parseInt(baseStr);
            targetId = Integer.parseInt(targetStr);
        } catch (NumberFormatException e) {
            out.print("{\"success\":false,\"message\":\"Invalid baseId or targetId.\"}");
            out.flush();
            return;
        }

        VersionComparisonResult comp = dm.compareVersions(userId, baseId, targetId);

        out.print("{");
        out.print("\"success\":true,");
        out.print("\"comparisonType\":\"" + escapeJson(comp.getComparisonType()) + "\",");
        out.print("\"comparisonTypeLabel\":\"" + escapeJson(comp.getComparisonTypeLabel()) + "\",");
        out.print("\"comparisonBannerMessage\":\"" + escapeJson(comp.getComparisonBannerMessage()) + "\",");

        out.print("\"baseDatasetId\":" + comp.getBaseDatasetId() + ",");
        out.print("\"targetDatasetId\":" + comp.getTargetDatasetId() + ",");
        out.print("\"baseVersionName\":\"" + escapeJson(comp.getBaseVersionName()) + "\",");
        out.print("\"targetVersionName\":\"" + escapeJson(comp.getTargetVersionName()) + "\",");
        out.print("\"baseUploadTime\":" + comp.getBaseUploadTime() + ",");
        out.print("\"targetUploadTime\":" + comp.getTargetUploadTime() + ",");

        // 1. Volume & Turnover
        out.print("\"baseRowCount\":" + comp.getBaseRowCount() + ",");
        out.print("\"targetRowCount\":" + comp.getTargetRowCount() + ",");
        out.print("\"rowCountDelta\":" + comp.getRowCountDelta() + ",");
        out.print("\"baseColumnCount\":" + comp.getBaseColumnCount() + ",");
        out.print("\"targetColumnCount\":" + comp.getTargetColumnCount() + ",");
        out.print("\"columnCountDelta\":" + comp.getColumnCountDelta() + ",");
        out.print("\"rowsAdded\":" + comp.getRowsAdded() + ",");
        out.print("\"rowsRemoved\":" + comp.getRowsRemoved() + ",");
        out.print("\"rowsRetained\":" + comp.getRowsRetained() + ",");
        out.print("\"recordLevelExplanation\":\"" + escapeJson(comp.getRecordLevelExplanation()) + "\",");

        // 2. Data Quality Dimensions
        out.print("\"baseQualityScore\":" + comp.getBaseQualityScore() + ",");
        out.print("\"targetQualityScore\":" + comp.getTargetQualityScore() + ",");
        out.print("\"qualityScoreDelta\":" + comp.getQualityScoreDelta() + ",");
        out.print("\"baseCompletenessScore\":" + comp.getBaseCompletenessScore() + ",");
        out.print("\"targetCompletenessScore\":" + comp.getTargetCompletenessScore() + ",");
        out.print("\"completenessScoreDelta\":" + comp.getCompletenessScoreDelta() + ",");
        out.print("\"baseUniquenessScore\":" + comp.getBaseUniquenessScore() + ",");
        out.print("\"targetUniquenessScore\":" + comp.getTargetUniquenessScore() + ",");
        out.print("\"uniquenessScoreDelta\":" + comp.getUniquenessScoreDelta() + ",");
        out.print("\"baseMissingCount\":" + comp.getBaseMissingCount() + ",");
        out.print("\"targetMissingCount\":" + comp.getTargetMissingCount() + ",");
        out.print("\"missingCountDelta\":" + comp.getMissingCountDelta() + ",");
        out.print("\"baseDuplicateCount\":" + comp.getBaseDuplicateCount() + ",");
        out.print("\"targetDuplicateCount\":" + comp.getTargetDuplicateCount() + ",");
        out.print("\"duplicatesDelta\":" + comp.getDuplicatesDelta() + ",");
        out.print("\"baseOutlierCount\":" + comp.getBaseOutlierCount() + ",");
        out.print("\"targetOutlierCount\":" + comp.getTargetOutlierCount() + ",");
        out.print("\"outlierCountDelta\":" + comp.getOutlierCountDelta() + ",");
        out.print("\"isIdentical\":" + comp.isIdentical() + ",");

        // 3. Columns
        out.print("\"addedColumns\":[");
        for (int i = 0; i < comp.getAddedColumns().size(); i++) {
            if (i > 0) out.print(",");
            out.print("\"" + escapeJson(comp.getAddedColumns().get(i)) + "\"");
        }
        out.print("],");

        out.print("\"removedColumns\":[");
        for (int i = 0; i < comp.getRemovedColumns().size(); i++) {
            if (i > 0) out.print(",");
            out.print("\"" + escapeJson(comp.getRemovedColumns().get(i)) + "\"");
        }
        out.print("],");

        out.print("\"commonColumns\":[");
        for (int i = 0; i < comp.getCommonColumns().size(); i++) {
            if (i > 0) out.print(",");
            out.print("\"" + escapeJson(comp.getCommonColumns().get(i)) + "\"");
        }
        out.print("],");

        out.print("\"typeChanges\":{");
        boolean first = true;
        for (Map.Entry<String, String> e : comp.getTypeChanges().entrySet()) {
            if (!first) out.print(",");
            out.print("\"" + escapeJson(e.getKey()) + "\":\"" + escapeJson(e.getValue()) + "\"");
            first = false;
        }
        out.print("},");

        // Schema Table
        out.print("\"schemaTable\":[");
        for (int i = 0; i < comp.getSchemaTable().size(); i++) {
            if (i > 0) out.print(",");
            VersionComparisonResult.SchemaEvolutionItem item = comp.getSchemaTable().get(i);
            out.print("{");
            out.print("\"columnName\":\"" + escapeJson(item.getColumnName()) + "\",");
            out.print("\"baseType\":\"" + escapeJson(item.getBaseType()) + "\",");
            out.print("\"targetType\":\"" + escapeJson(item.getTargetType()) + "\",");
            out.print("\"status\":\"" + escapeJson(item.getStatus()) + "\"");
            out.print("}");
        }
        out.print("],");

        // Numeric Comparisons
        out.print("\"numericComparisons\":[");
        for (int i = 0; i < comp.getNumericComparisons().size(); i++) {
            if (i > 0) out.print(",");
            VersionComparisonResult.NumericShiftItem item = comp.getNumericComparisons().get(i);
            out.print("{");
            out.print("\"columnName\":\"" + escapeJson(item.getColumnName()) + "\",");
            out.print("\"baseMean\":" + (item.getBaseMean() != null ? item.getBaseMean() : "null") + ",");
            out.print("\"targetMean\":" + (item.getTargetMean() != null ? item.getTargetMean() : "null") + ",");
            out.print("\"absoluteShift\":" + (item.getAbsoluteShift() != null ? item.getAbsoluteShift() : "null") + ",");
            out.print("\"percentageChange\":" + (item.getPercentageChange() != null ? item.getPercentageChange() : "null") + ",");
            out.print("\"baseMedian\":" + (item.getBaseMedian() != null ? item.getBaseMedian() : "null") + ",");
            out.print("\"targetMedian\":" + (item.getTargetMedian() != null ? item.getTargetMedian() : "null") + ",");
            out.print("\"medianShift\":" + (item.getMedianShift() != null ? item.getMedianShift() : "null") + ",");
            out.print("\"status\":\"" + escapeJson(item.getStatus()) + "\",");
            out.print("\"explanation\":\"" + escapeJson(item.getExplanation()) + "\"");
            out.print("}");
        }
        out.print("],");

        out.print("\"meanShifts\":{");
        first = true;
        for (Map.Entry<String, Double> e : comp.getMeanShifts().entrySet()) {
            if (!first) out.print(",");
            out.print("\"" + escapeJson(e.getKey()) + "\":" + e.getValue());
            first = false;
        }
        out.print("},");

        out.print("\"medianShifts\":{");
        first = true;
        for (Map.Entry<String, Double> e : comp.getMedianShifts().entrySet()) {
            if (!first) out.print(",");
            out.print("\"" + escapeJson(e.getKey()) + "\":" + e.getValue());
            first = false;
        }
        out.print("},");

        out.print("\"numericComparisonMessage\":\"" + escapeJson(comp.getNumericComparisonMessage()) + "\",");

        // 4. Summary & Verdict
        out.print("\"overallVerdict\":\"" + escapeJson(comp.getOverallVerdict()) + "\",");
        out.print("\"summaryText\":\"" + escapeJson(comp.getSummaryText()) + "\",");

        out.print("\"improvements\":[");
        for (int i = 0; i < comp.getImprovements().size(); i++) {
            if (i > 0) out.print(",");
            out.print("\"" + escapeJson(comp.getImprovements().get(i)) + "\"");
        }
        out.print("],");

        out.print("\"deteriorations\":[");
        for (int i = 0; i < comp.getDeteriorations().size(); i++) {
            if (i > 0) out.print(",");
            out.print("\"" + escapeJson(comp.getDeteriorations().get(i)) + "\"");
        }
        out.print("],");

        out.print("\"neutralObservations\":[");
        for (int i = 0; i < comp.getNeutralObservations().size(); i++) {
            if (i > 0) out.print(",");
            out.print("\"" + escapeJson(comp.getNeutralObservations().get(i)) + "\"");
        }
        out.print("]");

        out.print("}");
        out.flush();
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }
}
