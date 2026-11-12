package com.datalens.controller;

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

/**
 * DataLens — SampleDataServlet
 * Serves and dynamically activates built-in sample datasets (E-Commerce Orders, Customer Quality Audit, Sales Transactions).
 */
@WebServlet(name = "SampleDataServlet", urlPatterns = {"/api/sample-data", "/sample-data"})
public class SampleDataServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {

        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        PrintWriter out = response.getWriter();

        String sampleType = request.getParameter("sample");
        if (sampleType == null || sampleType.trim().isEmpty()) {
            sampleType = request.getParameter("type");
        }

        if (sampleType == null || sampleType.trim().isEmpty()) {
            out.print("{\"success\":false,\"message\":\"Missing sample parameter. Specify 'ecommerce', 'customer', or 'sales'.\"}");
            out.flush();
            return;
        }

        sampleType = sampleType.trim().toLowerCase();
        String fileName;
        String displayName;

        switch (sampleType) {
            case "ecommerce":
            case "ecommerce_orders":
                fileName = "ecommerce_orders_dataset.csv";
                displayName = "E-Commerce Orders Dataset";
                break;
            case "customer":
            case "customer_audit":
            case "customer_quality_audit":
                fileName = "customer_quality_audit.csv";
                displayName = "Customer Quality Audit";
                break;
            case "sales":
            case "sample_sales":
                fileName = "sample_sales.csv";
                displayName = "Sales Transactions";
                break;
            case "datapilot":
            case "demo_datapilot":
            case "demo":
                fileName = "DEMO_DATAPILOT.csv";
                displayName = "DEMO_DATAPILOT.csv";
                break;
            case "validation":
            case "test_validation":
            case "datalens_validation":
            case "validation_test":
                fileName = "DataLens_Validation_Test_Dataset.csv";
                displayName = "DataLens_Validation_Test_Dataset.csv";
                break;
            default:
                out.print("{\"success\":false,\"message\":\"Unknown sample dataset type: '" + escapeJson(sampleType) + "'. Available: validation, ecommerce, customer, sales, demo.\"}");
                out.flush();
                return;
        }

        // Locate sample file across container paths
        File targetFile = null;

        String webappPath = getServletContext().getRealPath("/data/samples/" + fileName);
        if (webappPath != null) {
            File f = new File(webappPath);
            if (f.exists() && f.isFile()) {
                targetFile = f;
            }
        }

        if (targetFile == null) {
            File localPath = new File("data/samples/" + fileName);
            if (localPath.exists() && localPath.isFile()) {
                targetFile = localPath;
            }
        }

        if (targetFile == null) {
            File srcWebapp = new File("src/main/webapp/data/samples/" + fileName);
            if (srcWebapp.exists() && srcWebapp.isFile()) {
                targetFile = srcWebapp;
            }
        }

        if (targetFile == null || !targetFile.exists()) {
            out.print("{\"success\":false,\"message\":\"Sample dataset file '" + escapeJson(fileName) + "' is missing on server.\"}");
            out.flush();
            return;
        }

        HttpSession session = request.getSession(false);
        Integer userId = (session != null && session.getAttribute("userId") != null) ? (Integer) session.getAttribute("userId") : null;

        try {
            DatasetManager dm = DatasetManager.getInstance();
            Dataset dataset = dm.registerDataset(userId, displayName, fileName, targetFile.getAbsolutePath(), targetFile.length(), true);

            if (dataset != null) {
                out.print("{");
                out.print("\"success\":true,");
                out.print("\"message\":\"Loaded sample dataset '" + escapeJson(displayName) + "' successfully.\",");
                out.print("\"datasetName\":\"" + escapeJson(displayName) + "\",");
                out.print("\"fileName\":\"" + escapeJson(fileName) + "\",");
                out.print("\"rowCount\":" + dataset.getRowCount() + ",");
                out.print("\"columnCount\":" + dataset.getColumnCount() + ",");
                out.print("\"qualityScore\":" + dataset.getQualityScore() + ",");
                out.print("\"id\":" + dataset.getId() + ",");
                out.print("\"activeDatasetId\":" + dataset.getId());
                out.print("}");
            } else {
                out.print("{\"success\":false,\"message\":\"Failed to parse sample dataset '" + escapeJson(fileName) + "'.\"}");
            }
        } catch (Exception e) {
            out.print("{\"success\":false,\"message\":\"Error loading sample dataset: " + escapeJson(e.getMessage()) + "\"}");
        }
        out.flush();
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
