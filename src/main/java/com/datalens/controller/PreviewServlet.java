package com.datalens.controller;

import com.datalens.model.AnalysisResult;
import com.datalens.model.Dataset;
import com.datalens.service.DatasetManager;
import com.datalens.util.CSVParserUtil.CSVData;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import jakarta.servlet.http.HttpSession;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.List;

/**
 * DataLens — PreviewServlet
 * Provides paginated data rows with search filtering across all dataset columns.
 */
@WebServlet(name = "PreviewServlet", urlPatterns = {"/api/preview", "/preview"})
public class PreviewServlet extends HttpServlet {

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
        CSVData csvData = dm.getActiveCSVData(userId);

        if (dataset == null || csvData == null) {
            out.print("{\"success\":false,\"hasDataset\":false,\"message\":\"No active dataset loaded.\"}");
            out.flush();
            return;
        }

        // Parse query params
        int page = 1;
        int size = 100;
        String search = request.getParameter("search");
        if (search != null) search = search.trim().toLowerCase();

        try {
            String pageParam = request.getParameter("page");
            if (pageParam != null) page = Math.max(1, Integer.parseInt(pageParam));
        } catch (NumberFormatException ignored) {}

        try {
            String sizeParam = request.getParameter("size");
            if (sizeParam != null) {
                int parsedSize = Integer.parseInt(sizeParam);
                if (parsedSize > 0 && parsedSize <= 1000) {
                    size = parsedSize;
                }
            }
        } catch (NumberFormatException ignored) {}

        List<String> headers = csvData.getHeaders();
        List<List<String>> allRows = csvData.getRows();

        // Apply search filter if query is provided
        List<List<String>> filteredRows = new ArrayList<>();
        if (search != null && !search.isEmpty()) {
            for (List<String> row : allRows) {
                boolean match = false;
                for (String cell : row) {
                    if (cell != null && cell.toLowerCase().contains(search)) {
                        match = true;
                        break;
                    }
                }
                if (match) {
                    filteredRows.add(row);
                }
            }
        } else {
            filteredRows = allRows;
        }

        int totalMatchingRows = filteredRows.size();
        int totalPages = Math.max(1, (int) Math.ceil((double) totalMatchingRows / size));
        if (page > totalPages) page = totalPages;

        int startIndex = (page - 1) * size;
        int endIndex = Math.min(startIndex + size, totalMatchingRows);

        List<List<String>> pageRows = new ArrayList<>();
        if (startIndex < totalMatchingRows) {
            for (int i = startIndex; i < endIndex; i++) {
                pageRows.add(filteredRows.get(i));
            }
        }

        AnalysisResult analysis = dm.getActiveAnalysisResult(userId);

        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"success\":true,");
        sb.append("\"hasDataset\":true,");
        sb.append("\"datasetName\":\"").append(escapeJson(dataset.getOriginalName())).append("\",");
        sb.append("\"datasetTotalRows\":").append(allRows.size()).append(",");
        sb.append("\"totalRows\":").append(totalMatchingRows).append(",");
        sb.append("\"totalFilteredRows\":").append(totalMatchingRows).append(",");
        sb.append("\"totalPages\":").append(totalPages).append(",");
        sb.append("\"page\":").append(page).append(",");
        sb.append("\"size\":").append(size).append(",");
        sb.append("\"pageSize\":").append(size).append(",");
        sb.append("\"search\":\"").append(escapeJson(search != null ? search : "")).append("\",");

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
            sb.append("\"columnName\":\"").append(escapeJson(h)).append("\",");
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

        // Rows as Key-Value JSON Objects
        sb.append("\"rows\":[");
        for (int i = 0; i < pageRows.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("{");
            List<String> row = pageRows.get(i);
            for (int j = 0; j < headers.size(); j++) {
                if (j > 0) sb.append(",");
                String cell = (j < row.size()) ? row.get(j) : "";
                sb.append("\"").append(escapeJson(headers.get(j))).append("\":\"").append(escapeJson(cell)).append("\"");
            }
            sb.append("}");
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
