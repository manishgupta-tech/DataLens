package com.datalens.controller;

import com.datalens.model.AnalysisResult;
import com.datalens.model.AuditLogEntry;
import com.datalens.model.ColumnMetadata;
import com.datalens.model.Dataset;
import com.datalens.model.QualityIssue;
import com.datalens.service.DatasetManager;
import com.datalens.util.CSVParserUtil.CSVData;
import com.datalens.util.PDFReportGenerator;
import com.datalens.util.SessionRegistry;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import java.io.IOException;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;

/**
 * DataLens — ReportServlet
 * Exports Executive Profiling PDF, Printable HTML Report,
 * Data Dictionary CSV, Quality Audit JSON, Active Dataset CSV, and Audit Trail CSV.
 */
@WebServlet(name = "ReportServlet", urlPatterns = {
    "/api/report/executive",
    "/api/report/executive-pdf",
    "/api/report/dictionary",
    "/api/report/quality-json",
    "/api/report/audit-trail",
    "/api/report/dataset"
})
public class ReportServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {

        // Resolve authenticated session with token/sid query param and header fallback
        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;

        if (userId == null) {
            String token = request.getParameter("token");
            if (token == null) token = request.getParameter("sid");
            if (token == null) token = request.getParameter("sessionId");
            if (token == null) {
                String auth = request.getHeader("Authorization");
                if (auth != null && auth.startsWith("Bearer ")) token = auth.substring(7).trim();
            }
            if (token == null) token = request.getHeader("X-Session-ID");

            if (token != null && !token.trim().isEmpty()) {
                SessionRegistry.SessionData data = SessionRegistry.getSessionData(token);
                if (data != null) {
                    userId = data.userId;
                    if (session == null) {
                        session = request.getSession(true);
                    }
                    session.setAttribute("userId", data.userId);
                    session.setAttribute("userName", data.userName);
                    session.setAttribute("userEmail", data.userEmail);
                }
            }
        }

        DatasetManager dm = DatasetManager.getInstance();
        Dataset active = dm.getActiveDataset(userId);
        CSVData csv = dm.getActiveCSVData(userId);
        AnalysisResult analysis = dm.getActiveAnalysisResult(userId);

        String path = request.getRequestURI();

        // 1. Executive Report (PDF or Printable HTML)
        if (path.endsWith("/executive") || path.endsWith("/executive-pdf")) {
            if (active == null || analysis == null) {
                response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().print("{\"success\":false,\"message\":\"No active dataset loaded. Please upload or activate a dataset first.\"}");
                return;
            }

            String format = request.getParameter("format");
            String accept = request.getHeader("Accept");
            boolean wantsPdf = "pdf".equalsIgnoreCase(format) ||
                               path.endsWith("/executive-pdf") ||
                               (accept != null && accept.contains("application/pdf"));

            if (wantsPdf) {
                // Generate and stream real multi-page binary PDF
                try {
                    PDFReportGenerator pdfGen = new PDFReportGenerator();
                    byte[] pdfBytes = pdfGen.generateExecutivePdf(active, analysis);

                    String cleanName = active.getOriginalName().replaceAll("[^a-zA-Z0-9_.-]", "_");
                    if (cleanName.toLowerCase().endsWith(".csv")) {
                        cleanName = cleanName.substring(0, cleanName.length() - 4);
                    }

                    response.setContentType("application/pdf");
                    response.setContentLength(pdfBytes.length);
                    response.setHeader("Content-Disposition", "attachment; filename=\"DataLens_Executive_Report_" + cleanName + ".pdf\"");
                    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

                    OutputStream out = response.getOutputStream();
                    out.write(pdfBytes);
                    out.flush();

                    dm.logAction(userId, "EXPORT_REPORT", active.getOriginalName(), "Exported Executive Profiling PDF Report", null);
                    return;
                } catch (Exception ex) {
                    response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().print("{\"success\":false,\"message\":\"Failed to generate PDF report: " + escapeJson(ex.getMessage()) + "\"}");
                    return;
                }
            } else {
                // Generate Printable HTML Report
                response.setContentType("text/html;charset=UTF-8");
                PrintWriter out = response.getWriter();
                renderExecutiveHtml(out, active, analysis);
                dm.logAction(userId, "EXPORT_REPORT", active.getOriginalName(), "Viewed Executive Profiling Report (HTML)", null);
                out.flush();
                return;
            }
        }

        // 2. Data Dictionary CSV
        if (path.endsWith("/dictionary")) {
            if (active == null || analysis == null) {
                response.sendError(HttpServletResponse.SC_BAD_REQUEST, "No active dataset.");
                return;
            }
            response.setContentType("text/csv;charset=UTF-8");
            response.setHeader("Content-Disposition", "attachment; filename=\"data_dictionary_" + active.getOriginalName() + "\"");
            PrintWriter out = response.getWriter();
            out.println("Column Name,Data Type,Total Values,Missing Count,Missing %,Unique Values,Completeness %,Health Status,Min,Max,Mean,Median,Sample Std Dev,Sample Variance,IQR,Outliers Count,Mode,Skewness");
            for (ColumnMetadata c : analysis.getColumns()) {
                out.printf("\"%s\",\"%s\",%d,%d,%.2f%%,%d,%.2f%%,\"%s\",%s,%s,%s,%s,%s,%s,%s,%d,\"%s\",%s\n",
                    c.getName(),
                    c.getType(),
                    c.getTotalValues(),
                    c.getMissingCount(),
                    c.getMissingPercentage(),
                    c.getUniqueCount(),
                    c.getCompletenessPercentage(),
                    c.getHealthStatus(),
                    c.getMin() != null ? c.getMin() : "-",
                    c.getMax() != null ? c.getMax() : "-",
                    c.getMean() != null ? c.getMean() : "-",
                    c.getMedian() != null ? c.getMedian() : "-",
                    c.getSampleStdDev() != null ? c.getSampleStdDev() : "-",
                    c.getSampleVariance() != null ? c.getSampleVariance() : "-",
                    c.getIqr() != null ? c.getIqr() : "-",
                    c.getOutlierCount(),
                    c.getMostFrequentValue() != null ? c.getMostFrequentValue() : "-",
                    c.getSkewness() != null ? c.getSkewness() : "-");
            }
            dm.logAction(userId, "EXPORT_REPORT", active.getOriginalName(), "Exported Data Dictionary CSV", null);
            out.flush();
            return;
        }

        // 3. Quality Audit JSON
        if (path.endsWith("/quality-json")) {
            if (active == null || analysis == null) {
                response.sendError(HttpServletResponse.SC_BAD_REQUEST, "No active dataset.");
                return;
            }
            response.setContentType("application/json;charset=UTF-8");
            response.setHeader("Content-Disposition", "attachment; filename=\"quality_audit_" + active.getOriginalName().replace(".csv", "") + ".json\"");
            PrintWriter out = response.getWriter();

            out.print("{");
            out.print("\"reportType\":\"DataLens Quality Audit\",");
            out.print("\"generatedAt\":\"" + new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'").format(new Date()) + "\",");
            out.print("\"datasetName\":\"" + escapeJson(active.getOriginalName()) + "\",");
            out.print("\"rowCount\":" + active.getRowCount() + ",");
            out.print("\"columnCount\":" + active.getColumnCount() + ",");
            out.print("\"overallQualityScore\":" + analysis.getOverallQualityScore() + ",");
            out.print("\"dimensions\":{");
            out.print("\"completeness\":" + analysis.getCompletenessScore() + ",");
            out.print("\"uniqueness\":" + analysis.getUniquenessScore() + ",");
            out.print("\"validity\":" + analysis.getValidityScore() + ",");
            out.print("\"consistency\":" + analysis.getConsistencyScore());
            out.print("},");
            out.print("\"issues\":[");
            List<QualityIssue> issues = analysis.getIssues();
            for (int i = 0; i < issues.size(); i++) {
                if (i > 0) out.print(",");
                QualityIssue qi = issues.get(i);
                out.print("{");
                out.print("\"id\":\"" + qi.getId() + "\",");
                out.print("\"severity\":\"" + qi.getSeverity() + "\",");
                out.print("\"type\":\"" + qi.getType() + "\",");
                out.print("\"columnName\":\"" + escapeJson(qi.getColumnName()) + "\",");
                out.print("\"affectedRowsCount\":" + qi.getAffectedRowsCount() + ",");
                out.print("\"affectedPercentage\":" + qi.getAffectedPercentage() + ",");
                out.print("\"explanation\":\"" + escapeJson(qi.getExplanation()) + "\",");
                out.print("\"recommendation\":\"" + escapeJson(qi.getRecommendation()) + "\"");
                out.print("}");
            }
            out.print("]");
            out.print("}");
            dm.logAction(userId, "EXPORT_REPORT", active.getOriginalName(), "Exported Data Quality Audit JSON", null);
            out.flush();
            return;
        }

        // 4. Audit Trail History CSV
        if (path.endsWith("/audit-trail")) {
            response.setContentType("text/csv;charset=UTF-8");
            response.setHeader("Content-Disposition", "attachment; filename=\"audit_trail_log.csv\"");
            PrintWriter out = response.getWriter();
            out.println("Log ID,Timestamp,Action,Dataset Name,Details");
            List<AuditLogEntry> trail = dm.getAuditTrail(userId);
            for (AuditLogEntry e : trail) {
                out.printf("\"%s\",\"%s\",\"%s\",\"%s\",\"%s\"\n",
                    e.getId(),
                    new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date(e.getTimestamp())),
                    e.getAction(),
                    e.getDatasetName(),
                    e.getDetails() != null ? e.getDetails().replace("\"", "\"\"") : "");
            }
            out.flush();
            return;
        }

        // 5. Active Transformed Dataset CSV
        if (path.endsWith("/dataset")) {
            if (active == null || csv == null) {
                response.sendError(HttpServletResponse.SC_BAD_REQUEST, "No active dataset.");
                return;
            }
            response.setContentType("text/csv;charset=UTF-8");
            response.setHeader("Content-Disposition", "attachment; filename=\"dataset_" + active.getOriginalName() + "\"");
            PrintWriter out = response.getWriter();
            List<String> headers = csv.getHeaders();
            for (int i = 0; i < headers.size(); i++) {
                if (i > 0) out.print(",");
                out.print(escapeCsv(headers.get(i)));
            }
            out.println();
            for (List<String> row : csv.getRows()) {
                for (int i = 0; i < row.size(); i++) {
                    if (i > 0) out.print(",");
                    out.print(escapeCsv(row.get(i)));
                }
                out.println();
            }
            dm.logAction(userId, "EXPORT_REPORT", active.getOriginalName(), "Downloaded Active Dataset CSV", null);
            out.flush();
        }
    }

    private void renderExecutiveHtml(PrintWriter out, Dataset dataset, AnalysisResult analysis) {
        String name = dataset.getOriginalName();
        long rowCount = dataset.getRowCount();
        int colCount = dataset.getColumnCount();
        int score = analysis.getOverallQualityScore();

        out.println("<!DOCTYPE html>");
        out.println("<html lang=\"en\">");
        out.println("<head>");
        out.println("  <meta charset=\"UTF-8\">");
        out.println("  <title>DataLens — Executive Data Profiling Report</title>");
        out.println("  <style>");
        out.println("    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; padding: 36px; max-width: 1000px; margin: 0 auto; background: #fff; }");
        out.println("    .header { border-bottom: 3px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }");
        out.println("    .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }");
        out.println("    .subtitle { font-size: 13px; color: #64748b; margin: 4px 0 0 0; }");
        out.println("    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 18px; margin-bottom: 24px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }");
        out.println("    .meta-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }");
        out.println("    .meta-val { font-size: 15px; font-weight: 700; color: #0f172a; }");
        out.println("    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 28px; }");
        out.println("    .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-top: 4px solid #2563eb; border-radius: 6px; padding: 14px; text-align: center; }");
        out.println("    .kpi-num { font-size: 22px; font-weight: 800; color: #0f172a; margin: 6px 0; }");
        out.println("    .kpi-tag { font-size: 11px; font-weight: 700; color: #2563eb; text-transform: uppercase; }");
        out.println("    h3 { font-size: 15px; font-weight: 700; margin: 24px 0 12px 0; color: #0f172a; border-left: 4px solid #2563eb; padding-left: 8px; }");
        out.println("    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }");
        out.println("    th, td { padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; }");
        out.println("    th { background: #f1f5f9; font-weight: 700; color: #334155; }");
        out.println("    tr:nth-child(even) { background: #f8fafc; }");
        out.println("    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }");
        out.println("    .badge-critical { background: #fee2e2; color: #991b1b; }");
        out.println("    .badge-warning { background: #fef3c7; color: #92400e; }");
        out.println("    .badge-info { background: #e0f2fe; color: #075985; }");
        out.println("    .btn-print { background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; }");
        out.println("    @media print { .no-print { display: none; } body { padding: 0; } }");
        out.println("  </style>");
        out.println("</head>");
        out.println("<body>");
        out.println("  <div class=\"header\">");
        out.println("    <div>");
        out.println("      <h1 class=\"title\">DATALENS — Executive Data Profiling Report</h1>");
        out.println("      <p class=\"subtitle\">Automated Statistical Quality &amp; Hygiene Assessment • " + new Date() + "</p>");
        out.println("    </div>");
        out.println("    <div class=\"no-print\">");
        out.println("      <button class=\"btn-print\" onclick=\"window.print()\">Print / Save as PDF</button>");
        out.println("    </div>");
        out.println("  </div>");

        out.println("  <div class=\"meta-box\">");
        out.println("    <div><div class=\"meta-label\">Dataset</div><div class=\"meta-val\">" + escapeHtml(name) + "</div></div>");
        out.println("    <div><div class=\"meta-label\">Row Count</div><div class=\"meta-val\">" + String.format("%,d", rowCount) + "</div></div>");
        out.println("    <div><div class=\"meta-label\">Column Count</div><div class=\"meta-val\">" + colCount + "</div></div>");
        out.println("    <div><div class=\"meta-label\">Quality Health</div><div class=\"meta-val\">" + (score >= 80 ? "Grade A (Good)" : (score >= 60 ? "Grade B (Fair)" : "Grade C (Action Needed)")) + "</div></div>");
        out.println("  </div>");

        out.println("  <div class=\"kpi-grid\">");
        out.println("    <div class=\"kpi-card\" style=\"border-top-color:#2563eb;\"><div class=\"meta-label\">Quality Score</div><div class=\"kpi-num\">" + score + "%</div><div class=\"kpi-tag\">Overall</div></div>");
        out.println("    <div class=\"kpi-card\" style=\"border-top-color:#10b981;\"><div class=\"meta-label\">Completeness</div><div class=\"kpi-num\">" + String.format(java.util.Locale.US, "%.1f%%", analysis.getCompletenessScore()) + "</div><div class=\"kpi-tag\">Hygiene</div></div>");
        out.println("    <div class=\"kpi-card\" style=\"border-top-color:#8b5cf6;\"><div class=\"meta-label\">Uniqueness</div><div class=\"kpi-num\">" + String.format(java.util.Locale.US, "%.1f%%", analysis.getUniquenessScore()) + "</div><div class=\"kpi-tag\">Cardinality</div></div>");
        out.println("    <div class=\"kpi-card\" style=\"border-top-color:#f59e0b;\"><div class=\"meta-label\">Validity</div><div class=\"kpi-num\">" + String.format(java.util.Locale.US, "%.1f%%", analysis.getValidityScore()) + "</div><div class=\"kpi-tag\">Conformance</div></div>");
        out.println("    <div class=\"kpi-card\" style=\"border-top-color:#06b6d4;\"><div class=\"meta-label\">Consistency</div><div class=\"kpi-num\">" + String.format(java.util.Locale.US, "%.1f%%", analysis.getConsistencyScore()) + "</div><div class=\"kpi-tag\">Stability</div></div>");
        out.println("  </div>");

        out.println("  <h3>1. Attribute Profiling &amp; Data Dictionary</h3>");
        out.println("  <table>");
        out.println("    <thead><tr><th>Column Name</th><th>Type</th><th>Total</th><th>Missing</th><th>Missing %</th><th>Unique</th><th>Completeness</th><th>Health</th></tr></thead>");
        out.println("    <tbody>");
        for (ColumnMetadata col : analysis.getColumns()) {
            out.printf("      <tr><td><strong>%s</strong></td><td>%s</td><td>%,d</td><td>%,d</td><td>%.2f%%</td><td>%,d</td><td>%.2f%%</td><td>%s</td></tr>\n",
                escapeHtml(col.getName()), escapeHtml(col.getType()), col.getTotalValues(), col.getMissingCount(), col.getMissingPercentage(), col.getUniqueCount(), col.getCompletenessPercentage(), escapeHtml(col.getHealthStatus()));
        }
        out.println("    </tbody>");
        out.println("  </table>");

        out.println("  <h3>2. Quality Defect Inventory</h3>");
        if (analysis.getIssues().isEmpty()) {
            out.println("  <p style=\"color:#059669; font-weight:600;\">No critical data quality issues identified. Dataset complies with baseline standards.</p>");
        } else {
            out.println("  <table>");
            out.println("    <thead><tr><th>Severity</th><th>Issue Type</th><th>Attribute</th><th>Affected Rows</th><th>Diagnostic &amp; Recommendation</th></tr></thead>");
            out.println("    <tbody>");
            for (QualityIssue qi : analysis.getIssues()) {
                String badgeClass = "badge-info";
                if ("CRITICAL".equalsIgnoreCase(qi.getSeverity())) badgeClass = "badge-critical";
                else if ("WARNING".equalsIgnoreCase(qi.getSeverity())) badgeClass = "badge-warning";
                out.printf("      <tr><td><span class=\"badge %s\">%s</span></td><td>%s</td><td><strong>%s</strong></td><td>%,d (%.1f%%)</td><td>%s</td></tr>\n",
                    badgeClass, qi.getSeverity(), escapeHtml(qi.getType()), escapeHtml(qi.getColumnName()), qi.getAffectedRowsCount(), qi.getAffectedPercentage(), escapeHtml(qi.getRecommendation() != null ? qi.getRecommendation() : qi.getExplanation()));
            }
            out.println("    </tbody>");
            out.println("  </table>");
        }

        out.println("  <footer style=\"margin-top:40px; border-top:1px solid #e2e8f0; padding-top:12px; font-size:11px; color:#94a3b8; display:flex; justify-content:space-between;\">");
        out.println("    <span>DataLens Intelligence Platform • Confidential Executive Audit</span>");
        out.println("    <span>Page 1 of 1</span>");
        out.println("  </footer>");
        out.println("</body>");
        out.println("</html>");
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
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }

    private String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
