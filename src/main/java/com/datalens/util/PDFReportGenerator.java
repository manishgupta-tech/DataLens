package com.datalens.util;

import com.datalens.model.AnalysisResult;
import com.datalens.model.ColumnMetadata;
import com.datalens.model.Dataset;
import com.datalens.model.QualityIssue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * DataLens — PDFReportGenerator
 * Pure Java PDF 1.4 vector generator.
 * Produces multi-page, Adobe/Standard-compliant executive quality profiling reports
 * with zero external dependencies.
 */
public class PDFReportGenerator {

    private static class Page {
        final List<String> commands = new ArrayList<>();
    }

    private final List<Page> pages = new ArrayList<>();
    private Page currentPage;
    private final float width = 612f;  // Letter width (points)
    private final float height = 792f; // Letter height (points)
    private float cursorY = 740f;

    public PDFReportGenerator() {
        newPage();
    }

    private Page newPage() {
        currentPage = new Page();
        pages.add(currentPage);
        cursorY = 740f;
        return currentPage;
    }

    private void ensureSpace(float neededPoints) {
        if (cursorY - neededPoints < 50f) {
            newPage();
        }
    }

    private static String escapePdf(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)");
    }

    private void drawRect(float x, float y, float w, float h, Float fillR, Float fillG, Float fillB, Float strokeR, Float strokeG, Float strokeB, float lineWidth) {
        StringBuilder sb = new StringBuilder("q\n");
        if (fillR != null && fillG != null && fillB != null) {
            sb.append(String.format(java.util.Locale.US, "%.3f %.3f %.3f rg\n", fillR, fillG, fillB));
        }
        if (strokeR != null && strokeG != null && strokeB != null) {
            sb.append(String.format(java.util.Locale.US, "%.3f %.3f %.3f RG\n%.1f w\n", strokeR, strokeG, strokeB, lineWidth));
        }
        sb.append(String.format(java.util.Locale.US, "%.2f %.2f %.2f %.2f re\n", x, y, w, h));
        if (fillR != null && strokeR != null) {
            sb.append("B\n");
        } else if (fillR != null) {
            sb.append("f\n");
        } else if (strokeR != null) {
            sb.append("S\n");
        }
        sb.append("Q\n");
        currentPage.commands.add(sb.toString());
    }

    private void drawLine(float x1, float y1, float x2, float y2, float r, float g, float b, float lineWidth) {
        String cmd = String.format(java.util.Locale.US, "q\n%.3f %.3f %.3f RG\n%.1f w\n%.2f %.2f m\n%.2f %.2f l\nS\nQ\n",
                r, g, b, lineWidth, x1, y1, x2, y2);
        currentPage.commands.add(cmd);
    }

    private void drawText(String text, float x, float y, float fontSize, boolean bold, float r, float g, float b) {
        String font = bold ? "F2" : "F1";
        String safe = escapePdf(text);
        String cmd = String.format(java.util.Locale.US, "q\n%.3f %.3f %.3f rg\nBT\n/%s %.1f Tf\n%.2f %.2f Td\n(%s) Tj\nET\nQ\n",
                r, g, b, font, fontSize, x, y, safe);
        currentPage.commands.add(cmd);
    }

    public byte[] generateExecutivePdf(Dataset dataset, AnalysisResult analysis) throws IOException {
        String datasetName = dataset != null ? dataset.getOriginalName() : "Dataset";
        long rowCount = dataset != null ? dataset.getRowCount() : 0;
        int colCount = dataset != null ? dataset.getColumnCount() : 0;
        long fileSize = dataset != null ? dataset.getFileSize() : 0;
        String formattedSize = formatBytes(fileSize);
        String dateStr = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss z").format(new Date());

        int overallScore = analysis != null ? analysis.getOverallQualityScore() : 100;
        double completeness = analysis != null ? analysis.getCompletenessScore() : 100.0;
        double uniqueness = analysis != null ? analysis.getUniquenessScore() : 100.0;
        double validity = analysis != null ? analysis.getValidityScore() : 100.0;
        double consistency = analysis != null ? analysis.getConsistencyScore() : 100.0;

        // 1. Header Banner (Navy theme #0f172a)
        drawRect(36, cursorY - 55, 540, 65, 0.059f, 0.090f, 0.165f, null, null, null, 0);
        drawText("DATALENS \u2014 EXECUTIVE DATASET PROFILING REPORT", 48, cursorY - 18, 14, true, 1f, 1f, 1f);
        drawText(String.format("Generated: %s  |  Platform: DataLens Quality & Analytics", dateStr), 48, cursorY - 34, 8.5f, false, 0.85f, 0.90f, 0.95f);
        drawText(String.format("Dataset: %s  |  Size: %s  |  Rows: %,d  |  Columns: %d", datasetName, formattedSize, rowCount, colCount), 48, cursorY - 48, 8.5f, false, 0.70f, 0.85f, 1.0f);
        cursorY -= 75;

        // 2. Executive KPI Cards (5 cards across)
        ensureSpace(70);
        float cardWidth = 100f;
        float cardGap = 10f;
        float startX = 36f;

        drawKpiCard(startX, cursorY - 50, cardWidth, 50, "Quality Score", overallScore + "/100", overallScore >= 80 ? "EXCELLENT" : (overallScore >= 60 ? "MODERATE" : "CRITICAL"), 0.15f, 0.39f, 0.92f);
        drawKpiCard(startX + (cardWidth + cardGap), cursorY - 50, cardWidth, 50, "Completeness", String.format(java.util.Locale.US, "%.1f%%", completeness), completeness >= 95 ? "HEALTHY" : "MISSING", 0.06f, 0.73f, 0.51f);
        drawKpiCard(startX + 2 * (cardWidth + cardGap), cursorY - 50, cardWidth, 50, "Uniqueness", String.format(java.util.Locale.US, "%.1f%%", uniqueness), uniqueness >= 95 ? "NO DUPS" : "DUPLICATES", 0.55f, 0.36f, 0.96f);
        drawKpiCard(startX + 3 * (cardWidth + cardGap), cursorY - 50, cardWidth, 50, "Validity", String.format(java.util.Locale.US, "%.1f%%", validity), validity >= 90 ? "CONFORMANT" : "ANOMALIES", 0.96f, 0.62f, 0.04f);
        drawKpiCard(startX + 4 * (cardWidth + cardGap), cursorY - 50, cardWidth, 50, "Consistency", String.format(java.util.Locale.US, "%.1f%%", consistency), consistency >= 90 ? "STABLE" : "VARIANCE", 0.05f, 0.65f, 0.91f);
        cursorY -= 65;

        // 3. Section Title: Quality Dimensions & Health Evaluation
        ensureSpace(35);
        drawText("1. QUALITY DIMENSIONS & BENCHMARK AUDIT", 36, cursorY, 11, true, 0.09f, 0.15f, 0.28f);
        drawLine(36, cursorY - 4, 576, cursorY - 4, 0.80f, 0.85f, 0.90f, 1);
        cursorY -= 18;

        String[] dimNames = {"Completeness", "Uniqueness", "Validity", "Consistency"};
        double[] dimScores = {completeness, uniqueness, validity, consistency};
        String[] dimDescs = {
            "Evaluates absent cells and missing record percentages across attributes.",
            "Measures redundancy, duplicate tuples, and distinct key cardinality.",
            "Checks schema adherence, standard data types, and syntax rules.",
            "Audits cross-column coherence, variance stability, and value distributions."
        };

        for (int i = 0; i < 4; i++) {
            ensureSpace(20);
            float score = (float) dimScores[i];
            drawRect(36, cursorY - 14, 540, 16, i % 2 == 0 ? 0.97f : 1.0f, i % 2 == 0 ? 0.98f : 1.0f, i % 2 == 0 ? 0.99f : 1.0f, 0.90f, 0.92f, 0.95f, 0.5f);
            drawText(dimNames[i], 42, cursorY - 10, 8.5f, true, 0.12f, 0.18f, 0.25f);
            drawText(String.format(java.util.Locale.US, "Score: %.1f%%", score), 130, cursorY - 10, 8.5f, true, score >= 90 ? 0.06f : 0.85f, score >= 90 ? 0.60f : 0.40f, score >= 90 ? 0.35f : 0.10f);
            drawText(dimDescs[i], 215, cursorY - 10, 8f, false, 0.40f, 0.45f, 0.52f);
            cursorY -= 17;
        }
        cursorY -= 10;

        // 4. Section Title: Column Catalog & Data Profiling Table
        ensureSpace(40);
        drawText("2. ATTRIBUTE CATALOG & PROFILING SUMMARY", 36, cursorY, 11, true, 0.09f, 0.15f, 0.28f);
        drawLine(36, cursorY - 4, 576, cursorY - 4, 0.80f, 0.85f, 0.90f, 1);
        cursorY -= 18;

        // Table Header
        drawRect(36, cursorY - 14, 540, 16, 0.92f, 0.94f, 0.97f, 0.80f, 0.84f, 0.90f, 0.5f);
        drawText("Column Name", 42, cursorY - 10, 8f, true, 0.15f, 0.20f, 0.30f);
        drawText("Type", 185, cursorY - 10, 8f, true, 0.15f, 0.20f, 0.30f);
        drawText("Missing", 265, cursorY - 10, 8f, true, 0.15f, 0.20f, 0.30f);
        drawText("Missing %", 330, cursorY - 10, 8f, true, 0.15f, 0.20f, 0.30f);
        drawText("Unique", 400, cursorY - 10, 8f, true, 0.15f, 0.20f, 0.30f);
        drawText("Completeness", 465, cursorY - 10, 8f, true, 0.15f, 0.20f, 0.30f);
        drawText("Health", 535, cursorY - 10, 8f, true, 0.15f, 0.20f, 0.30f);
        cursorY -= 16;

        if (analysis != null && analysis.getColumns() != null) {
            int rowIdx = 0;
            for (ColumnMetadata col : analysis.getColumns()) {
                ensureSpace(16);
                boolean alt = (rowIdx++ % 2 == 1);
                drawRect(36, cursorY - 13, 540, 15, alt ? 0.98f : 1f, alt ? 0.985f : 1f, alt ? 0.99f : 1f, 0.92f, 0.94f, 0.96f, 0.5f);

                String name = col.getName() != null ? col.getName() : "";
                if (name.length() > 22) name = name.substring(0, 20) + "..";

                drawText(name, 42, cursorY - 9, 7.5f, true, 0.10f, 0.15f, 0.25f);
                drawText(col.getType() != null ? col.getType() : "STRING", 185, cursorY - 9, 7.5f, false, 0.30f, 0.35f, 0.45f);
                drawText(String.format("%,d", col.getMissingCount()), 265, cursorY - 9, 7.5f, false, 0.25f, 0.30f, 0.40f);
                drawText(String.format(java.util.Locale.US, "%.1f%%", col.getMissingPercentage()), 330, cursorY - 9, 7.5f, false, col.getMissingPercentage() > 10 ? 0.85f : 0.25f, col.getMissingPercentage() > 10 ? 0.25f : 0.30f, 0.25f);
                drawText(String.format("%,d", col.getUniqueCount()), 400, cursorY - 9, 7.5f, false, 0.25f, 0.30f, 0.40f);
                drawText(String.format(java.util.Locale.US, "%.1f%%", col.getCompletenessPercentage()), 465, cursorY - 9, 7.5f, false, 0.05f, 0.55f, 0.30f);

                String health = col.getHealthStatus() != null ? col.getHealthStatus() : "Healthy";
                drawText(health, 535, cursorY - 9, 7.5f, true, health.equalsIgnoreCase("Healthy") ? 0.06f : 0.85f, health.equalsIgnoreCase("Healthy") ? 0.60f : 0.40f, 0.25f);
                cursorY -= 15;
            }
        }
        cursorY -= 12;

        // 5. Section Title: Quality Issues Inventory
        ensureSpace(40);
        drawText("3. DETECTED QUALITY ISSUES & REMEDIATION INVENTORY", 36, cursorY, 11, true, 0.09f, 0.15f, 0.28f);
        drawLine(36, cursorY - 4, 576, cursorY - 4, 0.80f, 0.85f, 0.90f, 1);
        cursorY -= 18;

        drawRect(36, cursorY - 14, 540, 16, 0.92f, 0.94f, 0.97f, 0.80f, 0.84f, 0.90f, 0.5f);
        drawText("Severity", 42, cursorY - 10, 8f, true, 0.15f, 0.20f, 0.30f);
        drawText("Issue Type", 95, cursorY - 10, 8f, true, 0.15f, 0.20f, 0.30f);
        drawText("Attribute / Scope", 195, cursorY - 10, 8f, true, 0.15f, 0.20f, 0.30f);
        drawText("Affected Rows", 290, cursorY - 10, 8f, true, 0.15f, 0.20f, 0.30f);
        drawText("Diagnostic & Recommended Remediation", 370, cursorY - 10, 8f, true, 0.15f, 0.20f, 0.30f);
        cursorY -= 16;

        if (analysis != null && analysis.getIssues() != null && !analysis.getIssues().isEmpty()) {
            int qIdx = 0;
            for (QualityIssue qi : analysis.getIssues()) {
                ensureSpace(24);
                boolean alt = (qIdx++ % 2 == 1);
                drawRect(36, cursorY - 20, 540, 22, alt ? 0.985f : 1f, alt ? 0.985f : 1f, alt ? 0.99f : 1f, 0.92f, 0.94f, 0.96f, 0.5f);

                String sev = qi.getSeverity() != null ? qi.getSeverity() : "INFO";
                float sR = 0.2f, sG = 0.5f, sB = 0.9f;
                if (sev.equalsIgnoreCase("CRITICAL")) { sR = 0.85f; sG = 0.20f; sB = 0.20f; }
                else if (sev.equalsIgnoreCase("WARNING")) { sR = 0.85f; sG = 0.55f; sB = 0.05f; }

                drawText(sev, 42, cursorY - 14, 7.5f, true, sR, sG, sB);
                drawText(qi.getType() != null ? qi.getType() : "AUDIT", 95, cursorY - 14, 7.5f, false, 0.25f, 0.30f, 0.40f);

                String colName = qi.getColumnName() != null ? qi.getColumnName() : "(Dataset-level)";
                if (colName.length() > 16) colName = colName.substring(0, 14) + "..";
                drawText(colName, 195, cursorY - 14, 7.5f, true, 0.15f, 0.20f, 0.30f);

                drawText(String.format("%,d (%.1f%%)", qi.getAffectedRowsCount(), qi.getAffectedPercentage()), 290, cursorY - 14, 7.5f, false, 0.30f, 0.35f, 0.45f);

                String rec = qi.getRecommendation() != null ? qi.getRecommendation() : qi.getExplanation();
                if (rec == null) rec = "Review attribute values.";
                if (rec.length() > 46) rec = rec.substring(0, 44) + "..";
                drawText(rec, 370, cursorY - 14, 7.5f, false, 0.20f, 0.25f, 0.35f);

                cursorY -= 22;
            }
        } else {
            ensureSpace(20);
            drawRect(36, cursorY - 16, 540, 18, 0.98f, 1f, 0.98f, 0.85f, 0.92f, 0.85f, 0.5f);
            drawText("No critical quality defects detected. Dataset satisfies integrity baseline.", 50, cursorY - 12, 8f, false, 0.05f, 0.55f, 0.20f);
            cursorY -= 20;
        }
        cursorY -= 12;

        // 6. Section Title: Executive Observations & Remediation Directives
        ensureSpace(70);
        drawText("4. EXECUTIVE OBSERVATIONS & ACTIONABLE RECOMMENDATIONS", 36, cursorY, 11, true, 0.09f, 0.15f, 0.28f);
        drawLine(36, cursorY - 4, 576, cursorY - 4, 0.80f, 0.85f, 0.90f, 1);
        cursorY -= 18;

        String[] observations = {
            String.format("Overall Data Health Score is %d/100 (%s). High-priority cleansing is recommended before loading to production pipelines.",
                    overallScore, overallScore >= 80 ? "Grade A" : (overallScore >= 60 ? "Grade B" : "Grade C/Remediation Required")),
            completeness < 100.0
                ? String.format("Dataset has missing cells across attributes (Completeness: %.1f%%). Use DataLens Imputation (Mean/Median/Mode) to fill nulls.", completeness)
                : "All records are 100% complete with no missing values detected.",
            uniqueness < 100.0
                ? String.format("Duplicate entries detected (Uniqueness: %.1f%%). Run 'Remove Duplicate Rows' to establish strict uniqueness.", uniqueness)
                : "No duplicate records detected across rows.",
            "Export this report along with the Data Dictionary and Quality Audit JSON to document compliance."
        };

        for (String obs : observations) {
            ensureSpace(16);
            drawText("\u2022", 42, cursorY - 8, 9f, true, 0.15f, 0.39f, 0.92f);
            drawText(obs, 56, cursorY - 8, 8f, false, 0.20f, 0.25f, 0.32f);
            cursorY -= 15;
        }

        return buildPdfBytes();
    }

    private void drawKpiCard(float x, float y, float w, float h, String title, String val, String tag, float r, float g, float b) {
        drawRect(x, y, w, h, 0.985f, 0.99f, 1.0f, 0.85f, 0.88f, 0.92f, 1f);
        drawRect(x, y + h - 3, w, 3, r, g, b, null, null, null, 0);
        drawText(title, x + 6, y + h - 14, 7.5f, false, 0.45f, 0.50f, 0.58f);
        drawText(val, x + 6, y + h - 28, 12f, true, 0.09f, 0.15f, 0.25f);
        drawText(tag, x + 6, y + 8, 7f, true, r, g, b);
    }

    private byte[] buildPdfBytes() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        int totalPages = pages.size();

        List<String> objects = new ArrayList<>();
        objects.add(null); // index 0 unused

        // Obj 1: Catalog
        objects.add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

        // Page IDs and Content IDs
        int startId = 5;
        List<Integer> pageIds = new ArrayList<>();
        List<Integer> contentIds = new ArrayList<>();
        for (int i = 0; i < totalPages; i++) {
            pageIds.add(startId++);
            contentIds.add(startId++);
        }

        // Obj 2: Pages
        StringBuilder kids = new StringBuilder();
        for (int id : pageIds) {
            if (kids.length() > 0) kids.append(" ");
            kids.append(id).append(" 0 R");
        }
        objects.add(String.format("2 0 obj\n<< /Type /Pages /Kids [%s] /Count %d >>\nendobj\n", kids, totalPages));

        // Obj 3: Helvetica
        objects.add("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n");

        // Obj 4: Helvetica-Bold
        objects.add("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n");

        // Page and Content objects
        for (int i = 0; i < totalPages; i++) {
            int pId = pageIds.get(i);
            int cId = contentIds.get(i);
            Page page = pages.get(i);

            // Add running footer
            String footer = String.format("DataLens Executive Profiling Report  \u2022  Page %d of %d  \u2022  Confidential & Proprietary", i + 1, totalPages);
            String safeFooter = escapePdf(footer);
            page.commands.add(String.format(java.util.Locale.US,
                "q\n0.450 0.450 0.500 rg\nBT\n/F1 8 Tf\n180.00 25.00 Td\n(%s) Tj\nET\nQ\n", safeFooter));

            StringBuilder contentBuilder = new StringBuilder();
            for (String cmd : page.commands) {
                contentBuilder.append(cmd);
            }
            byte[] streamBytes = contentBuilder.toString().getBytes(StandardCharsets.ISO_8859_1);

            while (objects.size() <= pId) objects.add(null);
            objects.set(pId, String.format(java.util.Locale.US,
                "%d 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.1f %.1f] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>\nendobj\n",
                pId, width, height, cId));

            while (objects.size() <= cId) objects.add(null);
            objects.set(cId, String.format(
                "%d 0 obj\n<< /Length %d >>\nstream\n%sendstream\nendobj\n",
                cId, streamBytes.length, contentBuilder.toString()));
        }

        // Write header with valid PDF binary comment
        byte[] pdfHeader = new byte[]{
            '%', 'P', 'D', 'F', '-', '1', '.', '4', '\n',
            '%', (byte) 0xE2, (byte) 0xE3, (byte) 0xCF, (byte) 0xD3, '\n'
        };
        baos.write(pdfHeader);

        int totalObjs = startId - 1;
        long[] xrefOffsets = new long[totalObjs + 1];
        xrefOffsets[0] = 0;

        for (int i = 1; i <= totalObjs; i++) {
            xrefOffsets[i] = baos.size();
            baos.write(objects.get(i).getBytes(StandardCharsets.ISO_8859_1));
        }

        long startXref = baos.size();
        StringBuilder xref = new StringBuilder(String.format("xref\n0 %d\n0000000000 65535 f \n", totalObjs + 1));
        for (int i = 1; i <= totalObjs; i++) {
            xref.append(String.format("%010d 00000 n \n", xrefOffsets[i]));
        }
        xref.append(String.format("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", totalObjs + 1, startXref));
        baos.write(xref.toString().getBytes(StandardCharsets.ISO_8859_1));

        return baos.toByteArray();
    }

    private String formatBytes(long bytes) {
        if (bytes <= 0) return "0 Bytes";
        final String[] units = new String[]{"Bytes", "KB", "MB", "GB"};
        int digitGroups = (int) (Math.log10(bytes) / Math.log10(1024));
        if (digitGroups >= units.length) digitGroups = units.length - 1;
        return String.format(java.util.Locale.US, "%.2f %s", bytes / Math.pow(1024, digitGroups), units[digitGroups]);
    }
}
