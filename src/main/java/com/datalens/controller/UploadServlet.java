package com.datalens.controller;

import com.datalens.model.Dataset;
import com.datalens.service.DatasetManager;
import com.datalens.util.CSVParserUtil;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.MultipartConfig;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.Part;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;

/**
 * DataLens — UploadServlet
 * Receives multipart/form-data CSV files up to 100 MB, validates them,
 * saves the physical file to data/uploads/, registers the dataset in DatasetManager/MySQL,
 * and returns JSON responses.
 */
@WebServlet(name = "UploadServlet", urlPatterns = {"/api/upload", "/upload"})
@MultipartConfig(
    fileSizeThreshold = 2 * 1024 * 1024,      // 2 MB threshold before writing to temp disk
    maxFileSize = 104857600L,                 // 100 MB max individual file size (100 * 1024 * 1024)
    maxRequestSize = 115343360L               // 110 MB max request size (110 * 1024 * 1024)
)
public class UploadServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    public static final int MAX_FILE_SIZE_MB = 100;
    public static final long MAX_FILE_SIZE_BYTES = (long) MAX_FILE_SIZE_MB * 1024L * 1024L; // 100 MB (104,857,600 bytes)
    public static final long MAX_REQUEST_SIZE_BYTES = 110L * 1024L * 1024L; // 110 MB

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        
        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");
        
        PrintWriter out = response.getWriter();
        File destinationFile = null;
        Dataset dataset = null;

        try {
            Part filePart = null;
            try {
                filePart = request.getPart("file");
            } catch (Exception e) {
                sendJsonError(response, out, "Failed to parse upload request or file exceeds " + MAX_FILE_SIZE_MB + " MB size limit.");
                return;
            }

            if (filePart == null || filePart.getSize() == 0) {
                sendJsonError(response, out, "Please select a valid CSV file to upload.");
                return;
            }

            // Check file size against 100 MB limit
            long fileSize = filePart.getSize();
            if (fileSize > MAX_FILE_SIZE_BYTES) {
                sendJsonError(response, out, "CSV file exceeds the " + MAX_FILE_SIZE_MB + " MB size limit.");
                return;
            }

            // Extract submitted filename and sanitize
            String submittedFileName = filePart.getSubmittedFileName();
            if (submittedFileName == null || submittedFileName.trim().isEmpty()) {
                sendJsonError(response, out, "Invalid or missing file name.");
                return;
            }

            // Prevent directory traversal attacks
            String originalFileName = new File(submittedFileName).getName().trim();
            if (originalFileName.isEmpty()) {
                sendJsonError(response, out, "Invalid file name.");
                return;
            }

            // Validate file extension (.csv only)
            String lowerName = originalFileName.toLowerCase();
            if (!lowerName.endsWith(".csv")) {
                sendJsonError(response, out, "Invalid file type. Only .csv files are allowed.");
                return;
            }

            // Determine safe storage filename
            String baseName = originalFileName.substring(0, originalFileName.lastIndexOf('.'));
            String safeBaseName = baseName.replaceAll("[^a-zA-Z0-9_-]", "_");
            if (safeBaseName.isEmpty()) {
                safeBaseName = "dataset";
            }
            String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS").format(new Date());
            String storedFileName = safeBaseName + "_" + timestamp + ".csv";

            // Resolve upload directory (data/uploads/)
            File uploadDir = resolveUploadDirectory();
            if (!uploadDir.exists()) {
                boolean created = uploadDir.mkdirs();
                if (!created && !uploadDir.exists()) {
                    sendJsonError(response, out, "Failed to create server upload storage directory.");
                    return;
                }
            }

            // Save the physical CSV file with streaming buffer
            destinationFile = new File(uploadDir, storedFileName);
            try (InputStream in = filePart.getInputStream();
                 OutputStream fileOut = new FileOutputStream(destinationFile)) {
                byte[] buffer = new byte[65536];
                int bytesRead;
                while ((bytesRead = in.read(buffer)) != -1) {
                    fileOut.write(buffer, 0, bytesRead);
                }
            }

            // Verify file was written to disk
            if (!destinationFile.exists() || destinationFile.length() == 0) {
                if (destinationFile.exists()) {
                    destinationFile.delete();
                }
                sendJsonError(response, out, "Failed to save CSV file to disk.");
                return;
            }

            // Validate CSV content directly from saved file
            CSVValidationResult validationResult = validateCsvFile(destinationFile);
            if (!validationResult.isValid()) {
                destinationFile.delete();
                sendJsonError(response, out, validationResult.getErrorMessage());
                return;
            }

            // Get authenticated userId from HttpSession with token fallback
            HttpSession session = request.getSession(false);
            Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;
            if (userId == null) {
                String token = request.getParameter("token");
                if (token == null) token = request.getParameter("sid");
                if (token == null) {
                    String auth = request.getHeader("Authorization");
                    if (auth != null && auth.startsWith("Bearer ")) token = auth.substring(7).trim();
                }
                if (token == null) token = request.getHeader("X-Session-ID");
                if (token != null) {
                    com.datalens.util.SessionRegistry.SessionData data = com.datalens.util.SessionRegistry.getSessionData(token);
                    if (data != null) {
                        userId = data.userId;
                    }
                }
            }

            // Check if upload should become active (dashboard UI passes activate=true)
            String activateParam = request.getParameter("activate");
            String activateHeader = request.getHeader("X-Activate-Dataset");
            boolean forceActive = "true".equalsIgnoreCase(activateParam) || "true".equalsIgnoreCase(activateHeader);
            boolean hasActive = (userId != null && DatasetManager.getInstance().getActiveDataset(userId) != null);
            boolean shouldBeActive = forceActive || !hasActive;

            // Register dataset into DatasetManager & MySQL
            dataset = DatasetManager.getInstance().registerDataset(
                userId, originalFileName, storedFileName, destinationFile.getAbsolutePath(), fileSize, shouldBeActive
            );

            if (dataset == null) {
                destinationFile.delete();
                sendJsonError(response, out, "Failed to register and analyze CSV dataset.");
                return;
            }

            // Store dataset reference in HttpSession if it became the active dataset
            if (session == null) {
                session = request.getSession(true);
            }
            if (shouldBeActive) {
                session.setAttribute("currentDataset_id", dataset.getId());
                session.setAttribute("currentDataset_originalName", originalFileName);
                session.setAttribute("currentDataset_storedName", storedFileName);
                session.setAttribute("currentDataset_path", destinationFile.getAbsolutePath());
                session.setAttribute("currentDataset_size", fileSize);
                session.setAttribute("currentDataset_uploadTime", dataset.getUploadTime());
            }

            String message = shouldBeActive
                ? String.format("Dataset '%s' uploaded and activated as your active dataset.", originalFileName)
                : String.format("Dataset '%s' uploaded and saved to storage. Current active dataset preserved.", originalFileName);

            // Build JSON success response
            String jsonResponse = String.format(
                "{\"success\":true,\"message\":\"%s\",\"fileName\":\"%s\",\"storedFileName\":\"%s\",\"fileSize\":%d,\"rowCount\":%d,\"columnCount\":%d,\"qualityScore\":%d,\"isActive\":%b,\"activeDatasetId\":%d,\"id\":%d}",
                escapeJson(message),
                escapeJson(originalFileName),
                escapeJson(storedFileName),
                fileSize,
                dataset.getRowCount(),
                dataset.getColumnCount(),
                dataset.getQualityScore(),
                shouldBeActive,
                shouldBeActive ? dataset.getId() : (session.getAttribute("currentDataset_id") != null ? (Integer) session.getAttribute("currentDataset_id") : dataset.getId()),
                dataset.getId()
            );

            response.setStatus(HttpServletResponse.SC_OK);
            out.print(jsonResponse);
            out.flush();

        } catch (Exception ex) {
            if (destinationFile != null && destinationFile.exists() && dataset == null) {
                try {
                    destinationFile.delete();
                } catch (Exception ignored) {}
            }
            sendJsonError(response, out, "Server error during file upload: " + ex.getMessage());
        }
    }

    private File resolveUploadDirectory() {
        return com.datalens.util.DBUtil.getUploadsDirectory();
    }

    private CSVValidationResult validateCsvFile(File file) {
        if (file == null || !file.exists() || file.length() == 0) {
            return new CSVValidationResult(false, "The uploaded CSV file is empty. Please select a CSV containing data.");
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (headerLine == null || headerLine.trim().isEmpty()) {
                return new CSVValidationResult(false, "CSV file is empty or missing a header row.");
            }

            // Strip UTF-8 BOM if present
            if (headerLine.startsWith("\uFEFF")) {
                headerLine = headerLine.substring(1);
            }

            if (headerLine.indexOf('\0') >= 0) {
                return new CSVValidationResult(false, "Invalid CSV format: file contains binary content.");
            }

            List<String> headers = CSVParserUtil.parseCSVLine(headerLine);
            if (headers.isEmpty() || (headers.size() == 1 && headers.get(0).trim().isEmpty())) {
                return new CSVValidationResult(false, "CSV header is invalid or empty.");
            }

            String firstDataRow = reader.readLine();
            if (firstDataRow == null || firstDataRow.trim().isEmpty()) {
                return new CSVValidationResult(false, "CSV file contains a header but has no data rows.");
            }

            return new CSVValidationResult(true, null);
        } catch (Exception e) {
            return new CSVValidationResult(false, "Failed to read CSV content: " + e.getMessage());
        }
    }

    private void sendJsonError(HttpServletResponse response, PrintWriter out, String message) {
        response.setStatus(HttpServletResponse.SC_OK);
        String json = String.format("{\"success\":false,\"message\":\"%s\"}", escapeJson(message));
        out.print(json);
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

    private static class CSVValidationResult {
        private final boolean valid;
        private final String errorMessage;

        public CSVValidationResult(boolean valid, String errorMessage) {
            this.valid = valid;
            this.errorMessage = errorMessage;
        }

        public boolean isValid() {
            return valid;
        }

        public String getErrorMessage() {
            return errorMessage;
        }
    }
}
