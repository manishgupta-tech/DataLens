package com.datalens.controller;

import com.datalens.model.ValidationRule;
import com.datalens.service.DatasetManager;
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
 * DataLens — ValidationServlet
 * Endpoints for managing, evaluating, and exporting user-defined data validation rules.
 */
@WebServlet(name = "ValidationServlet", urlPatterns = {"/api/validation", "/api/validation/add", "/api/validation/delete", "/api/validation/export"})
public class ValidationServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {

        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;
        DatasetManager dm = DatasetManager.getInstance();

        String path = request.getRequestURI();

        // 1. Delete rule via GET /api/validation/delete?id=...
        if (path.endsWith("/delete") || "delete".equalsIgnoreCase(request.getParameter("action"))) {
            String ruleId = request.getParameter("id");
            if (ruleId == null || ruleId.isEmpty()) {
                ruleId = request.getParameter("ruleId");
            }
            boolean deleted = false;
            if (ruleId != null && !ruleId.isEmpty()) {
                deleted = dm.deleteValidationRule(userId, ruleId);
            }
            response.setContentType("application/json;charset=UTF-8");
            PrintWriter out = response.getWriter();
            out.print("{\"success\":" + deleted + ",\"message\":\"" + (deleted ? "Validation rule deleted." : "Rule not found.") + "\"}");
            out.flush();
            return;
        }

        // 2. Export rules as CSV
        if (path.endsWith("/export")) {
            response.setContentType("text/csv;charset=UTF-8");
            response.setHeader("Content-Disposition", "attachment; filename=\"validation_results.csv\"");
            PrintWriter out = response.getWriter();
            out.println("Rule Name,Column,Rule Type,Status,Total Evaluated Rows,Violations Count,Failure Rate (%),Example Violations");
            List<ValidationRule> evaluated = dm.evaluateAllRules(userId);
            for (ValidationRule r : evaluated) {
                String exStr = "";
                if (r.getExampleViolations() != null && !r.getExampleViolations().isEmpty()) {
                    exStr = String.join("; ", r.getExampleViolations());
                } else if (r.getExampleFailedRows() != null && !r.getExampleFailedRows().isEmpty()) {
                    exStr = "Rows: " + r.getExampleFailedRows().toString().replace("[", "").replace("]", "");
                }
                out.printf("\"%s\",\"%s\",\"%s\",\"%s\",%d,%d,%.2f%%,\"%s\"\n",
                    escapeCsv(r.getName()),
                    escapeCsv(r.getColumnName()),
                    escapeCsv(r.getRuleType()),
                    escapeCsv(r.getStatus()),
                    r.getTotalRows(),
                    r.getFailedCount(),
                    r.getFailureRate(),
                    escapeCsv(exStr));
            }
            out.flush();
            return;
        }

        // 3. Return JSON list
        response.setContentType("application/json;charset=UTF-8");
        PrintWriter out = response.getWriter();
        List<ValidationRule> rules = dm.evaluateAllRules(userId);

        out.print("{");
        out.print("\"success\":true,");
        out.print("\"hasDataset\":" + (dm.getActiveDataset(userId) != null) + ",");
        out.print("\"rules\":[");
        for (int i = 0; i < rules.size(); i++) {
            if (i > 0) out.print(",");
            ValidationRule r = rules.get(i);
            out.print("{");
            out.print("\"id\":\"" + escapeJson(r.getId()) + "\",");
            out.print("\"name\":\"" + escapeJson(r.getName()) + "\",");
            out.print("\"ruleName\":\"" + escapeJson(r.getName()) + "\",");
            out.print("\"ruleType\":\"" + escapeJson(r.getRuleType()) + "\",");
            out.print("\"columnName\":\"" + escapeJson(r.getColumnName()) + "\",");
            out.print("\"targetColumn\":\"" + escapeJson(r.getColumnName()) + "\",");
            if (r.getDatasetId() != null) {
                out.print("\"datasetId\":" + r.getDatasetId() + ",");
            } else {
                out.print("\"datasetId\":null,");
            }
            out.print("\"createdAt\":" + r.getCreatedAt() + ",");
            if (r.getMinValue() != null) out.print("\"minValue\":" + r.getMinValue() + ",");
            if (r.getMaxValue() != null) out.print("\"maxValue\":" + r.getMaxValue() + ",");
            out.print("\"allowedValues\":[");
            if (r.getAllowedValues() != null) {
                for (int av = 0; av < r.getAllowedValues().size(); av++) {
                    if (av > 0) out.print(",");
                    out.print("\"" + escapeJson(r.getAllowedValues().get(av)) + "\"");
                }
            }
            out.print("],");
            out.print("\"status\":\"" + escapeJson(r.getStatus()) + "\",");
            out.print("\"totalRows\":" + r.getTotalRows() + ",");
            out.print("\"totalEvaluatedRows\":" + r.getTotalRows() + ",");
            out.print("\"failedCount\":" + r.getFailedCount() + ",");
            out.print("\"failureRate\":" + r.getFailureRate() + ",");
            out.print("\"exampleFailedRows\":[");
            List<Integer> rows = r.getExampleFailedRows();
            if (rows != null) {
                for (int j = 0; j < rows.size(); j++) {
                    if (j > 0) out.print(",");
                    out.print(rows.get(j));
                }
            }
            out.print("],");
            out.print("\"exampleViolations\":[");
            List<String> exViolations = r.getExampleViolations();
            if (exViolations != null) {
                for (int j = 0; j < exViolations.size(); j++) {
                    if (j > 0) out.print(",");
                    out.print("\"" + escapeJson(exViolations.get(j)) + "\"");
                }
            }
            out.print("]");
            out.print("}");
        }
        out.print("]");
        out.print("}");
        out.flush();
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {

        response.setContentType("application/json;charset=UTF-8");
        PrintWriter out = response.getWriter();

        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;
        DatasetManager dm = DatasetManager.getInstance();

        String path = request.getRequestURI();

        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = request.getReader()) {
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
        }
        String body = sb.toString().trim();
        Map<String, Object> json = SimpleJsonParser.parseObject(body);

        if (path.endsWith("/delete")) {
            String ruleId = null;
            if (json.get("ruleId") != null) {
                ruleId = String.valueOf(json.get("ruleId"));
            } else if (json.get("id") != null) {
                ruleId = String.valueOf(json.get("id"));
            } else {
                ruleId = request.getParameter("id");
                if (ruleId == null) ruleId = request.getParameter("ruleId");
            }

            boolean deleted = false;
            if (ruleId != null && !ruleId.isEmpty()) {
                deleted = dm.deleteValidationRule(userId, ruleId);
            }
            out.print("{\"success\":" + deleted + ",\"message\":\"" + (deleted ? "Validation rule deleted." : "Rule not found.") + "\"}");
            out.flush();
            return;
        }

        // Add Rule with strict field validation
        String name = json.get("name") != null ? String.valueOf(json.get("name")).trim() : "";
        String colName = json.get("columnName") != null ? String.valueOf(json.get("columnName")).trim() : "";
        String ruleType = json.get("ruleType") != null ? String.valueOf(json.get("ruleType")).trim() : "NO_MISSING";

        if (name.isEmpty()) {
            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            out.print("{\"success\":false,\"message\":\"Rule Name is required.\"}");
            out.flush();
            return;
        }

        if (colName.isEmpty()) {
            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            out.print("{\"success\":false,\"message\":\"Target Column is required.\"}");
            out.flush();
            return;
        }

        ValidationRule rule = new ValidationRule();
        rule.setName(name);
        rule.setRuleType(ruleType);
        rule.setColumnName(colName);

        if (json.get("datasetId") instanceof Number) {
            rule.setDatasetId(((Number) json.get("datasetId")).intValue());
        }

        // Parse numeric range
        Double minVal = null;
        Double maxVal = null;
        if (json.get("minValue") != null) {
            try {
                minVal = Double.parseDouble(String.valueOf(json.get("minValue")).trim());
                rule.setMinValue(minVal);
            } catch (Exception ignored) {}
        }
        if (json.get("maxValue") != null) {
            try {
                maxVal = Double.parseDouble(String.valueOf(json.get("maxValue")).trim());
                rule.setMaxValue(maxVal);
            } catch (Exception ignored) {}
        }

        if ("NUMERIC_RANGE".equalsIgnoreCase(ruleType)) {
            if (minVal == null && maxVal == null) {
                response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
                out.print("{\"success\":false,\"message\":\"Please enter at least one boundary (Min or Max) for Numeric Range.\"}");
                out.flush();
                return;
            }
            if (minVal != null && maxVal != null && minVal > maxVal) {
                response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
                out.print("{\"success\":false,\"message\":\"Minimum value cannot be greater than Maximum value.\"}");
                out.flush();
                return;
            }
        }

        // Parse allowed values
        List<String> allowedList = new ArrayList<>();
        Object allowedObj = json.get("allowedValues");
        if (allowedObj instanceof List) {
            for (Object item : (List<?>) allowedObj) {
                if (item != null && !String.valueOf(item).trim().isEmpty()) {
                    allowedList.add(String.valueOf(item).trim());
                }
            }
        } else if (allowedObj instanceof String) {
            String s = (String) allowedObj;
            for (String part : s.split(",")) {
                if (!part.trim().isEmpty()) allowedList.add(part.trim());
            }
        }

        if ("ALLOWED_VALUES".equalsIgnoreCase(ruleType)) {
            if (allowedList.isEmpty()) {
                response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
                out.print("{\"success\":false,\"message\":\"Please provide one or more comma-separated allowed values.\"}");
                out.flush();
                return;
            }
        }
        rule.setAllowedValues(allowedList);

        if (json.get("targetColumn") != null) {
            rule.setTargetColumn(String.valueOf(json.get("targetColumn")).trim());
        }
        if (json.get("operator") != null) {
            rule.setOperator(String.valueOf(json.get("operator")).trim());
        }

        ValidationRule added = dm.addValidationRule(userId, rule);
        out.print("{\"success\":true,\"message\":\"Validation rule added successfully.\",\"rule\":{\"id\":\"" + added.getId() + "\",\"name\":\"" + escapeJson(added.getName()) + "\",\"status\":\"" + added.getStatus() + "\",\"failedCount\":" + added.getFailedCount() + "}}");
        out.flush();
    }

    @Override
    protected void doDelete(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        String ruleId = request.getParameter("id");
        if (ruleId == null || ruleId.isEmpty()) {
            ruleId = request.getParameter("ruleId");
        }
        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;
        DatasetManager dm = DatasetManager.getInstance();
        boolean deleted = false;
        if (ruleId != null && !ruleId.isEmpty()) {
            deleted = dm.deleteValidationRule(userId, ruleId);
        }
        response.setContentType("application/json;charset=UTF-8");
        PrintWriter out = response.getWriter();
        out.print("{\"success\":" + deleted + ",\"message\":\"" + (deleted ? "Validation rule deleted." : "Rule not found.") + "\"}");
        out.flush();
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }

    private String escapeCsv(String s) {
        if (s == null) return "";
        return s.replace("\"", "\"\"");
    }
}
