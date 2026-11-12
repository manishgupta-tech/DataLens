package com.datalens.controller;

import com.datalens.model.AuditLogEntry;
import com.datalens.model.Dataset;
import com.datalens.service.DatasetManager;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;

/**
 * DataLens — HistoryServlet
 * Manages dataset history, version switching, deletions, and Audit Trail logs.
 */
@WebServlet(name = "HistoryServlet", urlPatterns = {"/api/history", "/history", "/api/history/load", "/history/load", "/api/history/delete"})
public class HistoryServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {

        String path = request.getServletPath();
        if (path.endsWith("/load") || request.getParameter("loadId") != null || request.getParameter("id") != null) {
            handleLoadDataset(request, response);
            return;
        }

        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");

        PrintWriter out = response.getWriter();

        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;

        DatasetManager dm = DatasetManager.getInstance();
        Dataset activeDataset = dm.getActiveDataset(userId);
        List<Dataset> history = (userId != null) ? dm.getDatasetDAO().getDatasetsByUserId(userId) : dm.getDatasetDAO().getAllDatasets();
        List<AuditLogEntry> auditTrail = dm.getAuditTrail(userId);

        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"success\":true,");
        sb.append("\"activeDatasetId\":").append(activeDataset != null ? activeDataset.getId() : -1).append(",");
        sb.append("\"history\":[");

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

        for (int i = 0; i < history.size(); i++) {
            if (i > 0) sb.append(",");
            Dataset d = history.get(i);
            boolean isActive = (activeDataset != null && d.getId() == activeDataset.getId());

            sb.append("{");
            sb.append("\"id\":").append(d.getId()).append(",");
            sb.append("\"originalName\":\"").append(escapeJson(d.getOriginalName())).append("\",");
            sb.append("\"storedName\":\"").append(escapeJson(d.getStoredName())).append("\",");
            sb.append("\"rowCount\":").append(d.getRowCount()).append(",");
            sb.append("\"columnCount\":").append(d.getColumnCount()).append(",");
            sb.append("\"numericCount\":").append(d.getNumericCount()).append(",");
            sb.append("\"categoricalCount\":").append(d.getCategoricalCount()).append(",");
            sb.append("\"missingCount\":").append(d.getMissingCount()).append(",");
            sb.append("\"duplicateCount\":").append(d.getDuplicateCount()).append(",");
            sb.append("\"qualityScore\":").append(d.getQualityScore()).append(",");
            sb.append("\"uploadTime\":").append(d.getUploadTime()).append(",");
            sb.append("\"uploadDateFormatted\":\"").append(sdf.format(new Date(d.getUploadTime()))).append("\",");
            sb.append("\"fileSize\":").append(d.getFileSize()).append(",");
            sb.append("\"fileSizeFormatted\":\"").append(formatFileSize(d.getFileSize())).append("\",");
            sb.append("\"isActive\":").append(isActive).append(",");
            sb.append("\"status\":\"").append(isActive ? "ACTIVE" : "STORED").append("\"");
            sb.append("}");
        }

        sb.append("],");

        // Audit Trail
        sb.append("\"auditTrail\":[");
        for (int i = 0; i < auditTrail.size(); i++) {
            if (i > 0) sb.append(",");
            AuditLogEntry entry = auditTrail.get(i);
            sb.append("{");
            sb.append("\"id\":\"").append(entry.getId()).append("\",");
            sb.append("\"timestamp\":").append(entry.getTimestamp()).append(",");
            sb.append("\"dateFormatted\":\"").append(sdf.format(new Date(entry.getTimestamp()))).append("\",");
            sb.append("\"action\":\"").append(entry.getAction()).append("\",");
            sb.append("\"datasetName\":\"").append(escapeJson(entry.getDatasetName())).append("\",");
            sb.append("\"details\":\"").append(escapeJson(entry.getDetails())).append("\"");
            sb.append("}");
        }
        sb.append("]");

        sb.append("}");

        out.print(sb.toString());
        out.flush();
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        String action = request.getParameter("action");
        if ("delete".equalsIgnoreCase(action) || path.endsWith("/delete")) {
            handleDeleteDataset(request, response);
        } else if ("activate".equalsIgnoreCase(action)) {
            handleActivateDataset(request, response);
        } else {
            handleLoadDataset(request, response);
        }
    }

    private void handleActivateDataset(HttpServletRequest request, HttpServletResponse response) throws IOException {
        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");
        PrintWriter out = response.getWriter();
        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;

        String idParam = request.getParameter("id");
        if (idParam == null || idParam.isEmpty()) {
            idParam = request.getParameter("loadId");
        }

        if (idParam != null && !idParam.isEmpty()) {
            try {
                int id = Integer.parseInt(idParam);
                DatasetManager dm = DatasetManager.getInstance();
                boolean activated = dm.activateDataset(userId, id);
                if (activated) {
                    Dataset active = dm.getActiveDataset(userId);
                    if (session != null && active != null) {
                        session.setAttribute("currentDataset_id", active.getId());
                        session.setAttribute("currentDataset_originalName", active.getOriginalName());
                        session.setAttribute("currentDataset_storedName", active.getStoredName());
                        session.setAttribute("currentDataset_path", active.getFilePath());
                        session.setAttribute("currentDataset_size", active.getFileSize());
                        session.setAttribute("currentDataset_uploadTime", active.getUploadTime());
                    }
                    out.print("{\"success\":true,\"message\":\"Activated dataset '" + escapeJson(active.getOriginalName()) + "'.\",\"datasetName\":\"" + escapeJson(active.getOriginalName()) + "\",\"datasetId\":" + id + ",\"activeDatasetId\":" + id + ",\"id\":" + id + "}");
                    out.flush();
                    return;
                }
            } catch (Exception ignored) {}
        }
        out.print("{\"success\":false,\"message\":\"Dataset not found or unauthorized.\"}");
        out.flush();
    }

    private void handleDeleteDataset(HttpServletRequest request, HttpServletResponse response) throws IOException {
        response.setContentType("application/json;charset=UTF-8");
        PrintWriter out = response.getWriter();
        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;

        String idParam = request.getParameter("id");
        if (idParam != null) {
            try {
                int id = Integer.parseInt(idParam);
                DatasetManager dm = DatasetManager.getInstance();
                Dataset target = dm.getDatasetDAO().getDatasetById(id, userId);
                if (target != null) {
                    Dataset active = dm.getActiveDataset(userId);
                    boolean wasActive = (active != null && active.getId() == id);
                    dm.getDatasetDAO().deleteDataset(id, userId);
                    if (target.getFilePath() != null) {
                        try {
                            File physicalFile = new File(target.getFilePath());
                            if (physicalFile.exists() && physicalFile.isFile()) {
                                physicalFile.delete();
                            }
                        } catch (Exception ignored) {}
                    }
                    dm.logAction(userId, "DELETE", target.getOriginalName(), "Deleted dataset record ID " + id, null);

                    if (wasActive) {
                        List<Dataset> remaining = dm.getDatasetDAO().getDatasetsByUserId(userId);
                        if (!remaining.isEmpty()) {
                            Dataset next = remaining.get(0);
                            dm.activateDataset(userId, next.getId());
                            if (session != null) {
                                session.setAttribute("currentDataset_id", next.getId());
                                session.setAttribute("currentDataset_originalName", next.getOriginalName());
                                session.setAttribute("currentDataset_storedName", next.getStoredName());
                                session.setAttribute("currentDataset_path", next.getFilePath());
                                session.setAttribute("currentDataset_size", next.getFileSize());
                                session.setAttribute("currentDataset_uploadTime", next.getUploadTime());
                            }
                        } else {
                            dm.clearActiveDataset(userId);
                            if (session != null) {
                                session.removeAttribute("currentDataset_id");
                                session.removeAttribute("currentDataset_originalName");
                                session.removeAttribute("currentDataset_storedName");
                                session.removeAttribute("currentDataset_path");
                                session.removeAttribute("currentDataset_size");
                                session.removeAttribute("currentDataset_uploadTime");
                            }
                        }
                    }
                    out.print("{\"success\":true,\"message\":\"Dataset deleted successfully.\"}");
                    out.flush();
                    return;
                }
            } catch (Exception ignored) {}
        }
        out.print("{\"success\":false,\"message\":\"Dataset not found or unauthorized.\"}");
        out.flush();
    }

    private void handleLoadDataset(HttpServletRequest request, HttpServletResponse response)
            throws IOException {

        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");

        PrintWriter out = response.getWriter();

        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;

        String idParam = request.getParameter("loadId");
        if (idParam == null || idParam.isEmpty()) {
            idParam = request.getParameter("id");
        }

        if (idParam == null || idParam.isEmpty()) {
            out.print("{\"success\":false,\"message\":\"Missing dataset id parameter.\"}");
            out.flush();
            return;
        }

        int targetId;
        try {
            targetId = Integer.parseInt(idParam);
        } catch (NumberFormatException e) {
            out.print("{\"success\":false,\"message\":\"Invalid dataset id.\"}");
            out.flush();
            return;
        }

        DatasetManager dm = DatasetManager.getInstance();
        boolean loaded = dm.switchDatasetById(userId, targetId);

        if (loaded) {
            Dataset active = dm.getActiveDataset(userId);
            dm.logAction(userId, "SWITCH", active.getOriginalName(), "Switched active dataset to " + active.getOriginalName(), null);
            out.print("{");
            out.print("\"success\":true,");
            out.print("\"message\":\"Switched active dataset successfully.\",");
            out.print("\"datasetId\":" + targetId + ",");
            out.print("\"datasetName\":\"" + escapeJson(active.getOriginalName()) + "\"");
            out.print("}");
        } else {
            out.print("{\"success\":false,\"message\":\"Could not load dataset. File may be missing or inaccessible.\"}");
        }
        out.flush();
    }

    private String formatFileSize(long bytes) {
        if (bytes <= 0) return "0 Bytes";
        final String[] units = new String[] { "Bytes", "KB", "MB", "GB", "TB" };
        int digitGroups = (int) (Math.log10(bytes) / Math.log10(1024));
        return new java.text.DecimalFormat("#,##0.#").format(bytes / Math.pow(1024, digitGroups)) + " " + units[digitGroups];
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
