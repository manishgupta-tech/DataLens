package com.datalens.controller;

import com.datalens.model.AnalysisResult;
import com.datalens.model.ColumnMetadata;
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
import java.util.*;

/**
 * DataLens — VisualizationServlet
 * Prepares chart aggregation datasets for Chart.js (Bar, Line, Pie, Doughnut, Histogram).
 */
@WebServlet(name = "VisualizationServlet", urlPatterns = {"/api/visualization", "/visualization"})
public class VisualizationServlet extends HttpServlet {

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
        AnalysisResult analysis = dm.getActiveAnalysisResult(userId);

        if (dataset == null || csvData == null || analysis == null) {
            out.print("{\"success\":false,\"hasDataset\":false,\"message\":\"No active dataset loaded.\"}");
            out.flush();
            return;
        }

        List<String> headers = csvData.getHeaders();
        List<List<String>> rows = csvData.getRows();

        String chartType = request.getParameter("chartType");
        if (chartType == null || chartType.trim().isEmpty()) chartType = "bar";
        chartType = chartType.trim().toLowerCase();

        String xAxis = request.getParameter("xAxis");
        String yAxis = request.getParameter("yAxis");
        String aggregation = request.getParameter("aggregation");
        if (aggregation == null || aggregation.trim().isEmpty()) aggregation = "count";
        aggregation = aggregation.trim().toLowerCase();

        // Default selection if not specified
        if ((xAxis == null || xAxis.isEmpty()) && !headers.isEmpty()) {
            // Pick first categorical or first column
            for (ColumnMetadata col : analysis.getColumns()) {
                if ("CATEGORICAL".equals(col.getType())) {
                    xAxis = col.getName();
                    break;
                }
            }
            if (xAxis == null) xAxis = headers.get(0);
        }

        if ((yAxis == null || yAxis.isEmpty()) && headers.size() > 1) {
            // Pick first numeric column for Y axis
            for (ColumnMetadata col : analysis.getColumns()) {
                if ("NUMERIC".equals(col.getType()) && !col.getName().equals(xAxis)) {
                    yAxis = col.getName();
                    break;
                }
            }
        }

        int xColIdx = headers.indexOf(xAxis);
        int yColIdx = (yAxis != null) ? headers.indexOf(yAxis) : -1;

        List<String> labels = new ArrayList<>();
        List<Double> dataPoints = new ArrayList<>();
        String datasetLabel = (yAxis != null && !yAxis.isEmpty()) ? (capitalize(aggregation) + " of " + yAxis) : ("Count by " + xAxis);

        if ("histogram".equalsIgnoreCase(chartType)) {
            // Histogram logic on numeric column (using xAxis)
            if (xColIdx != -1) {
                List<Double> numbers = new ArrayList<>();
                for (List<String> r : rows) {
                    String v = (xColIdx < r.size()) ? r.get(xColIdx) : "";
                    try {
                        numbers.add(Double.parseDouble(v.trim().replace("$", "").replace("%", "").replace(",", "")));
                    } catch (Exception ignored) {}
                }
                if (!numbers.isEmpty()) {
                    Collections.sort(numbers);
                    double min = numbers.get(0);
                    double max = numbers.get(numbers.size() - 1);
                    int binCount = 8;
                    double binSize = (max - min) / binCount;
                    if (binSize <= 0) binSize = 1;

                    int[] bins = new int[binCount];
                    for (double num : numbers) {
                        int b = (int) ((num - min) / binSize);
                        if (b >= binCount) b = binCount - 1;
                        bins[b]++;
                    }

                    for (int i = 0; i < binCount; i++) {
                        double binStart = min + (i * binSize);
                        double binEnd = binStart + binSize;
                        labels.add(String.format("%.1f - %.1f", binStart, binEnd));
                        dataPoints.add((double) bins[i]);
                    }
                    datasetLabel = "Frequency Distribution (" + xAxis + ")";
                }
            }
        } else {
            // Standard categorical aggregation
            Map<String, List<Double>> groupedValues = new LinkedHashMap<>();

            for (List<String> r : rows) {
                String xVal = (xColIdx >= 0 && xColIdx < r.size()) ? r.get(xColIdx).trim() : "Unknown";
                if (xVal.isEmpty()) xVal = "(Empty)";

                groupedValues.putIfAbsent(xVal, new ArrayList<>());

                if (yColIdx >= 0 && yColIdx < r.size()) {
                    String yVal = r.get(yColIdx).trim();
                    try {
                        double val = Double.parseDouble(yVal.replace("$", "").replace("%", "").replace(",", ""));
                        groupedValues.get(xVal).add(val);
                    } catch (Exception ignored) {
                        groupedValues.get(xVal).add(0.0);
                    }
                } else {
                    groupedValues.get(xVal).add(1.0);
                }
            }

            // Limit categories to top 15 for readable charts
            int count = 0;
            for (Map.Entry<String, List<Double>> entry : groupedValues.entrySet()) {
                if (count++ >= 15) break;

                labels.add(entry.getKey());
                List<Double> list = entry.getValue();

                if ("sum".equals(aggregation)) {
                    double sum = 0;
                    for (double d : list) sum += d;
                    dataPoints.add(round2(sum));
                } else if ("avg".equals(aggregation) || "average".equals(aggregation)) {
                    double sum = 0;
                    for (double d : list) sum += d;
                    dataPoints.add(list.isEmpty() ? 0.0 : round2(sum / list.size()));
                } else if ("min".equals(aggregation)) {
                    double min = list.isEmpty() ? 0.0 : Collections.min(list);
                    dataPoints.add(round2(min));
                } else if ("max".equals(aggregation)) {
                    double max = list.isEmpty() ? 0.0 : Collections.max(list);
                    dataPoints.add(round2(max));
                } else { // count
                    dataPoints.add((double) list.size());
                }
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"success\":true,");
        sb.append("\"hasDataset\":true,");
        sb.append("\"chartType\":\"").append(escapeJson(chartType)).append("\",");
        sb.append("\"xAxis\":\"").append(escapeJson(xAxis != null ? xAxis : "")).append("\",");
        sb.append("\"yAxis\":\"").append(escapeJson(yAxis != null ? yAxis : "")).append("\",");
        sb.append("\"aggregation\":\"").append(escapeJson(aggregation)).append("\",");
        sb.append("\"datasetLabel\":\"").append(escapeJson(datasetLabel)).append("\",");
        sb.append("\"title\":\"").append(escapeJson(datasetLabel)).append("\",");

        // Labels
        sb.append("\"labels\":[");
        for (int i = 0; i < labels.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(escapeJson(labels.get(i))).append("\"");
        }
        sb.append("],");

        // Data
        sb.append("\"data\":[");
        for (int i = 0; i < dataPoints.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append(dataPoints.get(i));
        }
        sb.append("],");

        // Values
        sb.append("\"values\":[");
        for (int i = 0; i < dataPoints.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append(dataPoints.get(i));
        }
        sb.append("],");

        // Available columns for frontend select elements
        sb.append("\"columns\":[");
        List<ColumnMetadata> cols = analysis.getColumns();
        for (int i = 0; i < cols.size(); i++) {
            if (i > 0) sb.append(",");
            ColumnMetadata c = cols.get(i);
            sb.append("{");
            sb.append("\"name\":\"").append(escapeJson(c.getName())).append("\",");
            sb.append("\"dataType\":\"").append(c.getType()).append("\",");
            sb.append("\"type\":\"").append(c.getType()).append("\"");
            sb.append("}");
        }
        sb.append("],");

        sb.append("\"availableColumns\":[");
        for (int i = 0; i < cols.size(); i++) {
            if (i > 0) sb.append(",");
            ColumnMetadata c = cols.get(i);
            sb.append("{");
            sb.append("\"name\":\"").append(escapeJson(c.getName())).append("\",");
            sb.append("\"type\":\"").append(c.getType()).append("\"");
            sb.append("}");
        }
        sb.append("]");

        sb.append("}");

        out.print(sb.toString());
        out.flush();
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private String capitalize(String str) {
        if (str == null || str.isEmpty()) return "";
        return str.substring(0, 1).toUpperCase() + str.substring(1);
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
