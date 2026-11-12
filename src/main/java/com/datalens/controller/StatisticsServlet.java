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
import java.util.Map;

/**
 * DataLens — StatisticsServlet
 * Serves comprehensive descriptive statistics:
 * - Numeric: min, max, mean, median, sample & population variance, sample & population std dev, Q1, Q3, IQR, outliers, skewness
 * - Categorical: unique, mode, frequency distribution, rare categories, empty cells, casing anomalies
 * - Date: earliest date, latest date, range in days
 * - Pearson correlation matrix
 */
@WebServlet(name = "StatisticsServlet", urlPatterns = {"/api/statistics", "/statistics"})
public class StatisticsServlet extends HttpServlet {

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

        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"success\":true,");
        sb.append("\"hasDataset\":true,");
        sb.append("\"datasetName\":\"").append(escapeJson(dataset.getOriginalName())).append("\",");

        // Numeric Columns Statistics
        sb.append("\"numericColumns\":[");
        int numCount = 0;
        for (ColumnMetadata col : analysis.getColumns()) {
            if ("NUMERIC".equals(col.getType())) {
                if (numCount > 0) sb.append(",");
                sb.append("{");
                sb.append("\"name\":\"").append(escapeJson(col.getName())).append("\",");
                sb.append("\"columnName\":\"").append(escapeJson(col.getName())).append("\",");
                sb.append("\"count\":").append(col.getTotalValues() - col.getMissingCount()).append(",");
                sb.append("\"mean\":").append(col.getMean() != null ? col.getMean() : 0.0).append(",");
                sb.append("\"median\":").append(col.getMedian() != null ? col.getMedian() : 0.0).append(",");
                sb.append("\"min\":").append(col.getMin() != null ? col.getMin() : 0.0).append(",");
                sb.append("\"max\":").append(col.getMax() != null ? col.getMax() : 0.0).append(",");
                sb.append("\"sampleVariance\":").append(col.getSampleVariance() != null ? col.getSampleVariance() : 0.0).append(",");
                sb.append("\"populationVariance\":").append(col.getPopulationVariance() != null ? col.getPopulationVariance() : 0.0).append(",");
                sb.append("\"variance\":").append(col.getSampleVariance() != null ? col.getSampleVariance() : 0.0).append(",");
                sb.append("\"sampleStdDev\":").append(col.getSampleStdDev() != null ? col.getSampleStdDev() : 0.0).append(",");
                sb.append("\"populationStdDev\":").append(col.getPopulationStdDev() != null ? col.getPopulationStdDev() : 0.0).append(",");
                sb.append("\"stdDev\":").append(col.getSampleStdDev() != null ? col.getSampleStdDev() : 0.0).append(",");
                sb.append("\"q25\":").append(col.getQ25() != null ? col.getQ25() : 0.0).append(",");
                sb.append("\"q75\":").append(col.getQ75() != null ? col.getQ75() : 0.0).append(",");
                sb.append("\"iqr\":").append(col.getIqr() != null ? col.getIqr() : 0.0).append(",");
                sb.append("\"range\":").append(col.getRange() != null ? col.getRange() : 0.0).append(",");
                sb.append("\"outlierCount\":").append(col.getOutlierCount()).append(",");
                sb.append("\"skewness\":").append(col.getSkewness() != null ? col.getSkewness() : 0.0);
                sb.append("}");
                numCount++;
            }
        }
        sb.append("],");

        // Categorical Columns Statistics
        sb.append("\"categoricalColumns\":[");
        int catCount = 0;
        for (ColumnMetadata col : analysis.getColumns()) {
            if ("CATEGORICAL".equals(col.getType()) || "BOOLEAN".equals(col.getType())) {
                if (catCount > 0) sb.append(",");
                sb.append("{");
                sb.append("\"name\":\"").append(escapeJson(col.getName())).append("\",");
                sb.append("\"columnName\":\"").append(escapeJson(col.getName())).append("\",");
                sb.append("\"type\":\"").append(col.getType()).append("\",");
                sb.append("\"totalCount\":").append(col.getTotalValues()).append(",");
                sb.append("\"uniqueCount\":").append(col.getUniqueCount()).append(",");
                sb.append("\"mostFrequentValue\":\"").append(escapeJson(col.getMostFrequentValue() != null ? col.getMostFrequentValue() : "N/A")).append("\",");
                sb.append("\"topFrequency\":").append(col.getMostFrequentCount()).append(",");
                sb.append("\"mostFrequentCount\":").append(col.getMostFrequentCount()).append(",");
                sb.append("\"rareCategoriesCount\":").append(col.getRareCategoriesCount()).append(",");
                sb.append("\"inconsistentCasing\":").append(col.isInconsistentCasingDetected()).append(",");
                
                sb.append("\"topValues\":[");
                List<Map<String, Object>> topList = col.getTopValues();
                for (int j = 0; j < topList.size(); j++) {
                    if (j > 0) sb.append(",");
                    Map<String, Object> item = topList.get(j);
                    sb.append("{");
                    sb.append("\"value\":\"").append(escapeJson(String.valueOf(item.get("value")))).append("\",");
                    sb.append("\"count\":").append(item.get("count")).append(",");
                    sb.append("\"percentage\":").append(item.get("percentage"));
                    sb.append("}");
                }
                sb.append("]");
                sb.append("}");
                catCount++;
            }
        }
        sb.append("],");

        // Date Columns Statistics
        sb.append("\"dateColumns\":[");
        int dateColCount = 0;
        for (ColumnMetadata col : analysis.getColumns()) {
            if ("DATE".equals(col.getType())) {
                if (dateColCount > 0) sb.append(",");
                sb.append("{");
                sb.append("\"name\":\"").append(escapeJson(col.getName())).append("\",");
                sb.append("\"earliestDate\":\"").append(escapeJson(col.getEarliestDate() != null ? col.getEarliestDate() : "-")).append("\",");
                sb.append("\"latestDate\":\"").append(escapeJson(col.getLatestDate() != null ? col.getLatestDate() : "-")).append("\",");
                sb.append("\"dateRangeDays\":").append(col.getDateRangeDays() != null ? col.getDateRangeDays() : 0).append(",");
                sb.append("\"invalidDateCount\":").append(col.getInvalidDateCount());
                sb.append("}");
                dateColCount++;
            }
        }
        sb.append("],");

        // Pearson Correlation Matrix
        sb.append("\"correlationMatrix\":{");
        Map<String, Map<String, Double>> corr = analysis.getCorrelationMatrix();
        boolean firstOuter = true;
        if (corr != null) {
            for (Map.Entry<String, Map<String, Double>> e1 : corr.entrySet()) {
                if (!firstOuter) sb.append(",");
                sb.append("\"").append(escapeJson(e1.getKey())).append("\":{");
                boolean firstInner = true;
                for (Map.Entry<String, Double> e2 : e1.getValue().entrySet()) {
                    if (!firstInner) sb.append(",");
                    sb.append("\"").append(escapeJson(e2.getKey())).append("\":").append(e2.getValue());
                    firstInner = false;
                }
                sb.append("}");
                firstOuter = false;
            }
        }
        sb.append("}");

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
