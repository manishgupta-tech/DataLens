package com.datalens.controller;

import com.datalens.model.Dataset;
import com.datalens.service.DatasetManager;
import com.datalens.util.CSVParserUtil.CSVData;
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

/**
 * DataLens — FilterServlet
 * Implements rule-based filtering and multi-criteria queries across the active dataset.
 */
@WebServlet(name = "FilterServlet", urlPatterns = {"/api/filter", "/filter"})
public class FilterServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        processFilter(request, response);
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        processFilter(request, response);
    }

    private void processFilter(HttpServletRequest request, HttpServletResponse response)
            throws IOException {

        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");

        PrintWriter out = response.getWriter();

        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;

        DatasetManager dm = DatasetManager.getInstance();
        Dataset dataset = dm.getActiveDataset(userId);
        CSVData csvData = dm.getActiveCSVData(userId);

        if (dataset == null || csvData == null) {
            out.print("{\"success\":false,\"hasDataset\":false,\"message\":\"No active dataset loaded.\"}");
            out.flush();
            return;
        }

        List<String> headers = csvData.getHeaders();
        List<List<String>> allRows = csvData.getRows();

        com.datalens.model.AnalysisResult analysis = dm.getActiveAnalysisResult(userId);

        // Extract rules from query params or JSON
        List<FilterRule> rules = extractRules(request);
        String search = request.getParameter("search");
        if (search != null) search = search.trim().toLowerCase();
        String sortColumn = request.getParameter("sortColumn");
        String sortOrder = request.getParameter("sortOrder");

        List<List<String>> matchedRows = new ArrayList<>();

        for (List<String> row : allRows) {
            boolean rowMatches = true;

            for (FilterRule rule : rules) {
                int colIdx = headers.indexOf(rule.column);
                if (colIdx == -1) continue;

                boolean isNumericCol = false;
                if (analysis != null && analysis.getColumns() != null) {
                    for (com.datalens.model.ColumnMetadata cm : analysis.getColumns()) {
                        if (cm.getName().equalsIgnoreCase(rule.column)) {
                            if ("NUMERIC".equalsIgnoreCase(cm.getType())) {
                                isNumericCol = true;
                            }
                            break;
                        }
                    }
                }

                String cellValue = (colIdx < row.size()) ? row.get(colIdx) : "";
                if (!evalRule(cellValue, rule.operator, rule.value, isNumericCol)) {
                    rowMatches = false;
                    break;
                }
            }

            if (rowMatches && search != null && !search.isEmpty()) {
                boolean foundInRow = false;
                for (String c : row) {
                    if (c != null && c.toLowerCase().contains(search)) {
                        foundInRow = true;
                        break;
                    }
                }
                if (!foundInRow) {
                    rowMatches = false;
                }
            }

            if (rowMatches) {
                matchedRows.add(row);
            }
        }

        // Apply sorting if requested
        if (sortColumn != null && !sortColumn.trim().isEmpty()) {
            final int sIdx = headers.indexOf(sortColumn.trim());
            if (sIdx != -1) {
                boolean isNum = false;
                if (analysis != null && analysis.getColumns() != null) {
                    for (com.datalens.model.ColumnMetadata cm : analysis.getColumns()) {
                        if (cm.getName().equalsIgnoreCase(sortColumn.trim()) && "NUMERIC".equalsIgnoreCase(cm.getType())) {
                            isNum = true;
                            break;
                        }
                    }
                }
                final boolean finalIsNum = isNum;
                final boolean isDesc = "desc".equalsIgnoreCase(sortOrder);
                matchedRows.sort((r1, r2) -> {
                    String v1 = (sIdx < r1.size() && r1.get(sIdx) != null) ? r1.get(sIdx).trim() : "";
                    String v2 = (sIdx < r2.size() && r2.get(sIdx) != null) ? r2.get(sIdx).trim() : "";
                    if (finalIsNum) {
                        Double d1 = parseStrictFiniteDouble(v1);
                        Double d2 = parseStrictFiniteDouble(v2);
                        if (d1 != null && d2 != null) {
                            return isDesc ? Double.compare(d2, d1) : Double.compare(d1, d2);
                        }
                        if (d1 != null) return -1;
                        if (d2 != null) return 1;
                    }
                    return isDesc ? v2.compareToIgnoreCase(v1) : v1.compareToIgnoreCase(v2);
                });
            }
        }

        String exportParam = request.getParameter("export");
        if ("csv".equalsIgnoreCase(exportParam) || "true".equalsIgnoreCase(exportParam)) {
            response.setContentType("text/csv;charset=UTF-8");
            response.setHeader("Content-Disposition", "attachment; filename=\"filtered_" + dataset.getOriginalName() + "\"");
            for (int i = 0; i < headers.size(); i++) {
                if (i > 0) out.print(",");
                out.print(escapeCsv(headers.get(i)));
            }
            out.println();
            for (List<String> r : matchedRows) {
                for (int j = 0; j < headers.size(); j++) {
                    if (j > 0) out.print(",");
                    out.print(escapeCsv(j < r.size() ? r.get(j) : ""));
                }
                out.println();
            }
            out.flush();
            return;
        }

        int page = 1;
        int pageSize = 25;
        try {
            if (request.getParameter("page") != null) {
                page = Integer.parseInt(request.getParameter("page").trim());
            }
            if (request.getParameter("pageSize") != null) {
                pageSize = Integer.parseInt(request.getParameter("pageSize").trim());
            }
        } catch (NumberFormatException ignored) {}

        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 25;

        int totalCount = allRows.size();
        int matchedCount = matchedRows.size();
        double matchPct = totalCount > 0 ? (matchedCount * 100.0 / totalCount) : 0.0;
        int totalPages = Math.max(1, (int) Math.ceil((double) matchedCount / pageSize));
        if (page > totalPages && matchedCount > 0) page = totalPages;

        int startIdx = (page - 1) * pageSize;
        int endIdx = Math.min(startIdx + pageSize, matchedCount);

        if (analysis == null) {
            analysis = dm.getActiveAnalysisResult(userId);
        }

        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"success\":true,");
        sb.append("\"hasDataset\":true,");
        sb.append("\"datasetName\":\"").append(escapeJson(dataset.getOriginalName())).append("\",");
        sb.append("\"totalRows\":").append(totalCount).append(",");
        sb.append("\"matchedRows\":").append(matchedCount).append(",");
        sb.append("\"page\":").append(page).append(",");
        sb.append("\"pageSize\":").append(pageSize).append(",");
        sb.append("\"totalPages\":").append(totalPages).append(",");
        sb.append("\"displayedRows\":").append(Math.max(0, endIdx - startIdx)).append(",");
        sb.append("\"matchPercentage\":").append(Math.round(matchPct * 100.0) / 100.0).append(",");

        // Structured Columns
        sb.append("\"columns\":[");
        for (int i = 0; i < headers.size(); i++) {
            if (i > 0) sb.append(",");
            String h = headers.get(i);
            String type = "TEXT";
            if (analysis != null) {
                for (com.datalens.model.ColumnMetadata cm : analysis.getColumns()) {
                    if (cm.getName().equalsIgnoreCase(h)) {
                        type = cm.getType();
                        break;
                    }
                }
            }
            sb.append("{");
            sb.append("\"name\":\"").append(escapeJson(h)).append("\",");
            sb.append("\"dataType\":\"").append(type).append("\",");
            sb.append("\"type\":\"").append(type).append("\"");
            sb.append("}");
        }
        sb.append("],");

        // Simple Headers Array
        sb.append("\"headers\":[");
        for (int i = 0; i < headers.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(escapeJson(headers.get(i))).append("\"");
        }
        sb.append("],");

        // Paged matched rows as JSON objects
        sb.append("\"rows\":[");
        for (int i = startIdx; i < endIdx; i++) {
            if (i > startIdx) sb.append(",");
            sb.append("{");
            List<String> r = matchedRows.get(i);
            for (int j = 0; j < headers.size(); j++) {
                if (j > 0) sb.append(",");
                String cell = (j < r.size()) ? r.get(j) : "";
                sb.append("\"").append(escapeJson(headers.get(j))).append("\":\"").append(escapeJson(cell)).append("\"");
            }
            sb.append("}");
        }
        sb.append("]");

        sb.append("}");

        out.print(sb.toString());
        out.flush();
    }

    private List<FilterRule> extractRules(HttpServletRequest request) {
        List<FilterRule> list = new ArrayList<>();

        // 1. Check direct query parameters
        String col = request.getParameter("column");
        String op = request.getParameter("operator");
        String val = request.getParameter("value");

        if (col != null && !col.trim().isEmpty()) {
            list.add(new FilterRule(col.trim(), op != null ? op.trim() : "equals", val != null ? val.trim() : ""));
        }

        // 2. Multi-rule parameters (e.g. column[], operator[], value[])
        String[] cols = request.getParameterValues("columns[]");
        String[] ops = request.getParameterValues("operators[]");
        String[] vals = request.getParameterValues("values[]");

        if (cols != null && ops != null) {
            for (int i = 0; i < cols.length; i++) {
                String c = cols[i];
                String o = (i < ops.length) ? ops[i] : "equals";
                String v = (vals != null && i < vals.length) ? vals[i] : "";
                if (c != null && !c.trim().isEmpty()) {
                    list.add(new FilterRule(c.trim(), o.trim(), v.trim()));
                }
            }
        }

        // 3. Try reading simple JSON payload if body exists
        if (list.isEmpty() && "POST".equalsIgnoreCase(request.getMethod())) {
            try {
                BufferedReader reader = request.getReader();
                StringBuilder jsonBuf = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    jsonBuf.append(line);
                }
                String body = jsonBuf.toString().trim();
                if (body.startsWith("{") && body.contains("\"column\"")) {
                    String extractedCol = extractJsonString(body, "column");
                    String extractedOp = extractJsonString(body, "operator");
                    String extractedVal = extractJsonString(body, "value");
                    if (extractedCol != null && !extractedCol.isEmpty()) {
                        list.add(new FilterRule(extractedCol, extractedOp != null ? extractedOp : "equals", extractedVal != null ? extractedVal : ""));
                    }
                }
            } catch (Exception ignored) {}
        }

        return list;
    }

    private Double parseStrictFiniteDouble(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.isEmpty()) return null;
        if ("null".equalsIgnoreCase(s) || "na".equalsIgnoreCase(s) || "n/a".equalsIgnoreCase(s) || "none".equalsIgnoreCase(s) || "nan".equalsIgnoreCase(s) || "?".equalsIgnoreCase(s) || "-".equals(s)) {
            return null;
        }
        String cleaned = s.replaceAll("^[\\$\\€\\£\\¥]", "").replaceAll("%$", "").trim().replaceAll(",", "");
        if (cleaned.isEmpty() || "+".equals(cleaned) || "-".equals(cleaned)) {
            return null;
        }
        if (!cleaned.matches("^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$")) {
            return null;
        }
        try {
            double d = Double.parseDouble(cleaned);
            if (Double.isFinite(d)) {
                return d;
            }
        } catch (NumberFormatException ignored) {}
        return null;
    }

    private boolean areNumbersEqual(double a, double b) {
        if (Double.compare(a, b) == 0) return true;
        return Math.abs(a - b) <= 1e-9;
    }

    private boolean evalRule(String cell, String op, String val, boolean isNumericCol) {
        String c = (cell == null) ? "" : cell.trim();
        String target = (val == null) ? "" : val.trim();

        if ("is_empty".equalsIgnoreCase(op)) {
            return c.isEmpty() || "null".equalsIgnoreCase(c) || "na".equalsIgnoreCase(c) || "n/a".equalsIgnoreCase(c) || "none".equalsIgnoreCase(c) || "nan".equalsIgnoreCase(c) || "?".equalsIgnoreCase(c);
        }
        if ("is_not_empty".equalsIgnoreCase(op)) {
            return !c.isEmpty() && !"null".equalsIgnoreCase(c) && !"na".equalsIgnoreCase(c) && !"n/a".equalsIgnoreCase(c) && !"none".equalsIgnoreCase(c) && !"nan".equalsIgnoreCase(c) && !"?".equalsIgnoreCase(c);
        }

        if (isNumericCol) {
            Double tNum = parseStrictFiniteDouble(target);
            if (tNum == null) {
                // Invalid numeric filter value input (e.g. "3500abc") -> no false match
                return false;
            }
            Double cNum = parseStrictFiniteDouble(c);
            if (cNum == null) {
                return false;
            }

            if ("equals".equalsIgnoreCase(op) || "eq".equalsIgnoreCase(op)) {
                return areNumbersEqual(cNum, tNum);
            }
            if ("not_equals".equalsIgnoreCase(op) || "neq".equalsIgnoreCase(op)) {
                return !areNumbersEqual(cNum, tNum);
            }
            if ("gt".equalsIgnoreCase(op) || "greater_than".equalsIgnoreCase(op)) {
                return cNum > tNum && !areNumbersEqual(cNum, tNum);
            }
            if ("lt".equalsIgnoreCase(op) || "less_than".equalsIgnoreCase(op)) {
                return cNum < tNum && !areNumbersEqual(cNum, tNum);
            }
            if ("gte".equalsIgnoreCase(op) || "greater_than_or_equal".equalsIgnoreCase(op)) {
                return cNum > tNum || areNumbersEqual(cNum, tNum);
            }
            if ("lte".equalsIgnoreCase(op) || "less_than_or_equal".equalsIgnoreCase(op)) {
                return cNum < tNum || areNumbersEqual(cNum, tNum);
            }
            if ("contains".equalsIgnoreCase(op)) {
                return c.toLowerCase().contains(target.toLowerCase());
            }
            if ("starts_with".equalsIgnoreCase(op)) {
                return c.toLowerCase().startsWith(target.toLowerCase());
            }
            return false;
        }

        if ("equals".equalsIgnoreCase(op) || "eq".equalsIgnoreCase(op)) {
            return c.equalsIgnoreCase(target);
        }
        if ("not_equals".equalsIgnoreCase(op) || "neq".equalsIgnoreCase(op)) {
            return !c.equalsIgnoreCase(target);
        }
        if ("contains".equalsIgnoreCase(op)) {
            return c.toLowerCase().contains(target.toLowerCase());
        }
        if ("starts_with".equalsIgnoreCase(op)) {
            return c.toLowerCase().startsWith(target.toLowerCase());
        }
        if ("gt".equalsIgnoreCase(op) || "greater_than".equalsIgnoreCase(op)) {
            return c.compareToIgnoreCase(target) > 0;
        }
        if ("lt".equalsIgnoreCase(op) || "less_than".equalsIgnoreCase(op)) {
            return c.compareToIgnoreCase(target) < 0;
        }
        if ("gte".equalsIgnoreCase(op) || "greater_than_or_equal".equalsIgnoreCase(op)) {
            return c.compareToIgnoreCase(target) >= 0;
        }
        if ("lte".equalsIgnoreCase(op) || "less_than_or_equal".equalsIgnoreCase(op)) {
            return c.compareToIgnoreCase(target) <= 0;
        }

        return false;
    }

    private String extractJsonString(String json, String key) {
        String pattern = "\"" + key + "\"\\s*:\\s*\"([^\"]*)\"";
        java.util.regex.Pattern p = java.util.regex.Pattern.compile(pattern);
        java.util.regex.Matcher m = p.matcher(json);
        if (m.find()) {
            return m.group(1);
        }
        return null;
    }

    private String escapeJson(String input) {
        if (input == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
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

    private String escapeCsv(String s) {
        if (s == null) return "";
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    private static class FilterRule {
        String column;
        String operator;
        String value;

        FilterRule(String column, String operator, String value) {
            this.column = column;
            this.operator = operator;
            this.value = value;
        }
    }
}
