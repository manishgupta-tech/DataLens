package com.datalens.controller;

import com.datalens.model.AnalysisResult;
import com.datalens.model.CleaningOperation;
import com.datalens.model.Dataset;
import com.datalens.service.CleaningService;
import com.datalens.service.CleaningService.CleaningResult;
import com.datalens.service.DatasetManager;
import com.datalens.util.CSVParserUtil.CSVData;
import com.datalens.util.SimpleJsonParser;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * DataLens — CleaningServlet
 * Endpoints for Data Cleaning Studio:
 * - POST /api/cleaning/preview: generates preview of transformations without saving
 * - POST /api/cleaning/apply: applies transformations and saves as a new dataset version
 * - POST /api/cleaning/restore: restores previous dataset version as active
 * - POST or GET /api/cleaning/download: downloads the cleaned dataset CSV
 */
@WebServlet(name = "CleaningServlet", urlPatterns = {
    "/api/cleaning",
    "/api/cleaning/preview",
    "/api/cleaning/apply",
    "/api/cleaning/restore",
    "/api/cleaning/download"
})
public class CleaningServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        if (path.endsWith("/download")) {
            handleDownload(request, response, new ArrayList<>());
        } else {
            response.sendError(HttpServletResponse.SC_METHOD_NOT_ALLOWED);
        }
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {

        String path = request.getRequestURI();

        // Read JSON body
        StringBuilder bodyBuilder = new StringBuilder();
        try (BufferedReader reader = request.getReader()) {
            String line;
            while ((line = reader.readLine()) != null) {
                bodyBuilder.append(line);
            }
        }
        String body = bodyBuilder.toString();

        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;

        DatasetManager dm = DatasetManager.getInstance();
        Dataset active = dm.getActiveDataset(userId);
        CSVData csv = dm.getActiveCSVData(userId);
        AnalysisResult analysis = dm.getActiveAnalysisResult(userId);

        if (active == null || csv == null) {
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().print("{\"success\":false,\"message\":\"No active dataset loaded for cleaning. Please upload or activate a dataset first.\"}");
            return;
        }

        if (path.endsWith("/restore")) {
            response.setContentType("application/json;charset=UTF-8");
            PrintWriter out = response.getWriter();
            Map<String, Object> map = SimpleJsonParser.parseObject(body);
            int targetId = 0;
            if (map.containsKey("datasetId")) {
                Object dId = map.get("datasetId");
                if (dId instanceof Number) targetId = ((Number) dId).intValue();
                else targetId = Integer.parseInt(String.valueOf(dId));
            }
            boolean switched = dm.setActiveDataset(userId, dm.getDatasetDAO().getDatasetById(targetId, userId));
            if (switched) {
                dm.logAction(userId, "RESTORE", active.getOriginalName(), "Restored dataset version ID " + targetId, null);
                out.print("{\"success\":true,\"message\":\"Restored dataset version successfully!\"}");
            } else {
                out.print("{\"success\":false,\"message\":\"Failed to restore dataset version.\"}");
            }
            out.flush();
            return;
        }

        // Parse operations list from request body
        List<CleaningOperation> operations = parseOperations(body);

        if (path.endsWith("/download")) {
            handleDownload(request, response, operations);
            return;
        }

        CleaningService cleaner = dm.getCleaningService();
        CleaningResult result = cleaner.processCleaning(csv, analysis, operations);

        response.setContentType("application/json;charset=UTF-8");
        PrintWriter out = response.getWriter();

        if (path.endsWith("/apply")) {
            // Apply & Save as New Version
            Map<String, Object> rootMap = SimpleJsonParser.parseObject(body);
            String customVersionName = rootMap.get("versionName") != null ? String.valueOf(rootMap.get("versionName")) : null;
            Dataset newVersion = dm.saveCleanedVersion(userId, active, result.getTransformedCSVData(), customVersionName, result.getAppliedOperationsSummary());

            out.print("{");
            out.print("\"success\":true,");
            out.print("\"message\":\"Cleaned dataset saved as new version!\",");
            out.print("\"newDatasetId\":" + newVersion.getId() + ",");
            out.print("\"newVersionName\":\"" + escapeJson(newVersion.getOriginalName()) + "\",");
            out.print("\"newQualityScore\":" + newVersion.getQualityScore() + ",");
            out.print("\"newRowCount\":" + newVersion.getRowCount() + ",");
            out.print("\"newColumnCount\":" + newVersion.getColumnCount() + ",");
            out.print("\"affectedRows\":" + result.getAffectedRowsCount() + ",");
            out.print("\"affectedCells\":" + result.getAffectedCellsCount() + ",");
            writeFullResultJson(out, result);
            out.print("}");
        } else {
            // Preview only
            out.print("{");
            out.print("\"success\":true,");
            out.print("\"originalRowCount\":" + result.getOriginalRowCount() + ",");
            out.print("\"cleanedRowCount\":" + result.getCleanedRowCount() + ",");
            out.print("\"originalColumnCount\":" + result.getOriginalColumnCount() + ",");
            out.print("\"cleanedColumnCount\":" + result.getCleanedColumnCount() + ",");
            out.print("\"affectedRowsCount\":" + result.getAffectedRowsCount() + ",");
            out.print("\"affectedCellsCount\":" + result.getAffectedCellsCount() + ",");
            writeFullResultJson(out, result);
            out.print("}");
        }
        out.flush();
    }

    private void writeFullResultJson(PrintWriter out, CleaningResult result) {
        // Detailed Impact Metrics
        out.print("\"originalRows\":" + result.getOriginalRowCount() + ",");
        out.print("\"remainingRows\":" + result.getCleanedRowCount() + ",");
        out.print("\"rowsRemoved\":" + result.getRowsRemoved() + ",");
        out.print("\"originalColumns\":" + result.getOriginalColumnCount() + ",");
        out.print("\"remainingColumns\":" + result.getCleanedColumnCount() + ",");
        out.print("\"columnsRemoved\":" + result.getColumnsRemoved() + ",");
        out.print("\"cellsModified\":" + result.getAffectedCellsCount() + ",");
        out.print("\"missingValuesBefore\":" + result.getMissingValuesBefore() + ",");
        out.print("\"missingValuesAfter\":" + result.getMissingValuesAfter() + ",");
        out.print("\"duplicateRowsBefore\":" + result.getDuplicateRowsBefore() + ",");
        out.print("\"duplicateRowsAfter\":" + result.getDuplicateRowsAfter() + ",");
        out.print("\"qualityScoreBefore\":" + result.getQualityScoreBefore() + ",");
        out.print("\"qualityScoreAfter\":" + result.getQualityScoreAfter() + ",");
        out.print("\"noChangesMessage\":\"" + escapeJson(result.getNoChangesMessage()) + "\",");

        // Summary
        out.print("\"summary\":[");
        for (int i = 0; i < result.getAppliedOperationsSummary().size(); i++) {
            if (i > 0) out.print(",");
            out.print("\"" + escapeJson(result.getAppliedOperationsSummary().get(i)) + "\"");
        }
        out.print("],");

        // Headers
        out.print("\"headers\":[");
        for (int i = 0; i < result.getHeaders().size(); i++) {
            if (i > 0) out.print(",");
            out.print("\"" + escapeJson(result.getHeaders().get(i)) + "\"");
        }
        out.print("],");

        // Complete Transformed Rows
        out.print("\"rows\":[");
        List<List<String>> rows = result.getRows();
        for (int r = 0; r < rows.size(); r++) {
            if (r > 0) out.print(",");
            out.print("[");
            List<String> row = rows.get(r);
            for (int c = 0; c < row.size(); c++) {
                if (c > 0) out.print(",");
                out.print("\"" + escapeJson(row.get(c)) + "\"");
            }
            out.print("]");
        }
        out.print("],");

        // Preview Rows (same as rows so all rows display in preview)
        out.print("\"previewRows\":[");
        for (int r = 0; r < rows.size(); r++) {
            if (r > 0) out.print(",");
            out.print("[");
            List<String> row = rows.get(r);
            for (int c = 0; c < row.size(); c++) {
                if (c > 0) out.print(",");
                out.print("\"" + escapeJson(row.get(c)) + "\"");
            }
            out.print("]");
        }
        out.print("],");

        // Original Headers
        out.print("\"originalHeaders\":[");
        for (int i = 0; i < result.getOriginalHeaders().size(); i++) {
            if (i > 0) out.print(",");
            out.print("\"" + escapeJson(result.getOriginalHeaders().get(i)) + "\"");
        }
        out.print("],");

        // Original Rows
        out.print("\"originalRows\":[");
        List<List<String>> origRows = result.getOriginalRows();
        for (int r = 0; r < origRows.size(); r++) {
            if (r > 0) out.print(",");
            out.print("[");
            List<String> row = origRows.get(r);
            for (int c = 0; c < row.size(); c++) {
                if (c > 0) out.print(",");
                out.print("\"" + escapeJson(row.get(c)) + "\"");
            }
            out.print("]");
        }
        out.print("],");

        // Changed Cell Coordinates ["r:c"]
        out.print("\"changedCells\":[");
        for (int i = 0; i < result.getChangedCellCoordinates().size(); i++) {
            if (i > 0) out.print(",");
            out.print("\"" + escapeJson(result.getChangedCellCoordinates().get(i)) + "\"");
        }
        out.print("],");

        // Cell Changes Map
        out.print("\"cellChanges\":{");
        int idx = 0;
        for (Map.Entry<String, Map<String, String>> entry : result.getCellChanges().entrySet()) {
            if (idx > 0) out.print(",");
            out.print("\"" + escapeJson(entry.getKey()) + "\":{");
            Map<String, String> m = entry.getValue();
            out.print("\"old\":\"" + escapeJson(m.get("old")) + "\",");
            out.print("\"new\":\"" + escapeJson(m.get("new")) + "\",");
            out.print("\"column\":\"" + escapeJson(m.get("column")) + "\"");
            out.print("}");
            idx++;
        }
        out.print("}");
    }

    private void handleDownload(HttpServletRequest request, HttpServletResponse response, List<CleaningOperation> operations) throws IOException {
        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;

        DatasetManager dm = DatasetManager.getInstance();
        Dataset active = dm.getActiveDataset(userId);
        CSVData csv = dm.getActiveCSVData(userId);
        AnalysisResult analysis = dm.getActiveAnalysisResult(userId);

        if (active == null || csv == null) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "No active dataset loaded.");
            return;
        }

        CSVData exportData = csv;
        if (operations != null && !operations.isEmpty()) {
            CleaningResult res = dm.getCleaningService().processCleaning(csv, analysis, operations);
            exportData = res.getTransformedCSVData();
        }

        String fileName = active.getOriginalName().replace(".csv", "") + "_cleaned.csv";
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + fileName + "\"");

        PrintWriter out = response.getWriter();
        List<String> headers = exportData.getHeaders();
        for (int i = 0; i < headers.size(); i++) {
            if (i > 0) out.print(",");
            out.print(escapeCsv(headers.get(i)));
        }
        out.println();

        for (List<String> row : exportData.getRows()) {
            for (int i = 0; i < row.size(); i++) {
                if (i > 0) out.print(",");
                out.print(escapeCsv(row.get(i)));
            }
            out.println();
        }
        out.flush();
    }

    @SuppressWarnings("unchecked")
    private List<CleaningOperation> parseOperations(String body) {
        List<CleaningOperation> list = new ArrayList<>();
        if (body == null || body.trim().isEmpty()) return list;

        try {
            Map<String, Object> root = SimpleJsonParser.parseObject(body);
            Object opsObj = root.get("operations");
            if (opsObj instanceof List) {
                List<Object> rawList = (List<Object>) opsObj;
                for (Object item : rawList) {
                    if (item instanceof Map) {
                        Map<String, Object> m = (Map<String, Object>) item;
                        CleaningOperation op = new CleaningOperation();
                        if (m.containsKey("type")) op.setOperationType(String.valueOf(m.get("type")));
                        else if (m.containsKey("operationType")) op.setOperationType(String.valueOf(m.get("operationType")));

                        if (m.containsKey("strategy")) op.setStrategy(String.valueOf(m.get("strategy")));
                        if (m.containsKey("column")) op.setColumnName(String.valueOf(m.get("column")));
                        else if (m.containsKey("columnName")) op.setColumnName(String.valueOf(m.get("columnName")));

                        if (m.containsKey("customValue")) op.setCustomValue(String.valueOf(m.get("customValue")));
                        if (m.containsKey("action")) op.setAction(String.valueOf(m.get("action")));
                        if (m.containsKey("newColumnName")) op.setNewColumnName(String.valueOf(m.get("newColumnName")));
                        if (m.containsKey("description")) op.setDescription(String.valueOf(m.get("description")));

                        list.add(op);
                    }
                }
            } else if (root.containsKey("type") || root.containsKey("operationType")) {
                // Single operation object
                CleaningOperation op = new CleaningOperation();
                if (root.containsKey("type")) op.setOperationType(String.valueOf(root.get("type")));
                else if (root.containsKey("operationType")) op.setOperationType(String.valueOf(root.get("operationType")));

                if (root.containsKey("strategy")) op.setStrategy(String.valueOf(root.get("strategy")));
                if (root.containsKey("column")) op.setColumnName(String.valueOf(root.get("column")));
                else if (root.containsKey("columnName")) op.setColumnName(String.valueOf(root.get("columnName")));

                if (root.containsKey("customValue")) op.setCustomValue(String.valueOf(root.get("customValue")));
                if (root.containsKey("action")) op.setAction(String.valueOf(root.get("action")));
                if (root.containsKey("newColumnName")) op.setNewColumnName(String.valueOf(root.get("newColumnName")));
                if (root.containsKey("description")) op.setDescription(String.valueOf(root.get("description")));

                list.add(op);
            }
        } catch (Exception ignored) {}

        return list;
    }

    private String escapeCsv(String s) {
        if (s == null) return "";
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '\"': sb.append("\\\""); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 32) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.toString();
    }
}
