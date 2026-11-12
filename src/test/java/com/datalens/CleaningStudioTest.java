package com.datalens;

import com.datalens.model.AnalysisResult;
import com.datalens.model.CleaningOperation;
import com.datalens.service.AnalysisService;
import com.datalens.service.CleaningService;
import com.datalens.service.CleaningService.CleaningResult;
import com.datalens.util.CSVParserUtil;
import com.datalens.util.CSVParserUtil.CSVData;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * DataLens — Automated Data Cleaning Studio Test Suite
 * Tests deterministic cleaning transformations using DEMO_DATAPILOT.csv (31 rows, 13 columns).
 */
public class CleaningStudioTest {

    public static void main(String[] args) {
        System.out.println("Running DataLens Data Cleaning Studio Test Suite...");
        int passed = 0;
        int total = 7;

        try {
            File demoFile = new File("data/samples/DEMO_DATAPILOT.csv");
            if (!demoFile.exists()) {
                demoFile = new File("src/main/webapp/data/samples/DEMO_DATAPILOT.csv");
            }
            if (!demoFile.exists()) {
                throw new IllegalStateException("DEMO_DATAPILOT.csv file not found on disk!");
            }

            CSVData originalData = CSVParserUtil.parseCSV(demoFile);
            com.datalens.model.Dataset ds = new com.datalens.model.Dataset();
            ds.setOriginalName("DEMO_DATAPILOT.csv");
            ds.setRowCount(originalData.getRowCount());
            ds.setColumnCount(originalData.getColumnCount());

            AnalysisService analysisService = new AnalysisService();
            AnalysisResult analysis = analysisService.analyzeCSVData(ds, originalData);

            CleaningService cleaner = new CleaningService();

            // Test 1: Verify Initial Dimensions (31 rows, 13 columns)
            if (originalData.getRowCount() == 31 && originalData.getColumnCount() == 13) {
                passed++;
                System.out.println("PASS: Test 1 - DEMO_DATAPILOT.csv dimensions verified (31 rows, 13 columns).");
            } else {
                System.err.println("FAIL: Test 1 - Unexpected dimensions: " + originalData.getRowCount() + " rows, " + originalData.getColumnCount() + " cols.");
            }

            // Test 2: Remove Exact Duplicates
            List<CleaningOperation> ops2 = new ArrayList<>();
            CleaningOperation dupOp = new CleaningOperation();
            dupOp.setOperationType("REMOVE_DUPLICATES");
            dupOp.setStrategy("remove_exact");
            dupOp.setColumnName("ALL");
            ops2.add(dupOp);

            CleaningResult res2 = cleaner.processCleaning(originalData, analysis, ops2);
            if (res2.getCleanedRowCount() == 30 && res2.getAffectedRowsCount() >= 1) {
                passed++;
                System.out.println("PASS: Test 2 - Duplicate removal correctly dropped exact duplicate row (31 -> 30 rows).");
            } else {
                System.err.println("FAIL: Test 2 - Cleaned row count: " + res2.getCleanedRowCount());
            }

            // Test 3: Text Sanitization (Trim + Remove Special Characters)
            List<CleaningOperation> ops3 = new ArrayList<>();
            CleaningOperation specialOp = new CleaningOperation();
            specialOp.setOperationType("TEXT_SANITIZE");
            specialOp.setStrategy("remove_special");
            specialOp.setColumnName("Customer_Name");
            ops3.add(specialOp);

            CleaningResult res3 = cleaner.processCleaning(originalData, analysis, ops3);
            boolean specialRemoved = false;
            for (List<String> row : res3.getRows()) {
                if (row.get(1).equals("Peter Parker")) { // was Peter@# Parker$
                    specialRemoved = true;
                    break;
                }
            }
            if (specialRemoved && res3.getChangedCellCoordinates().size() > 0) {
                passed++;
                System.out.println("PASS: Test 3 - Text sanitization correctly sanitized 'Peter@# Parker$' to 'Peter Parker'.");
            } else {
                System.err.println("FAIL: Test 3 - Special character removal failed.");
            }

            // Test 4: Missing Value Imputation with Mean
            List<CleaningOperation> ops4 = new ArrayList<>();
            CleaningOperation imputeOp = new CleaningOperation();
            imputeOp.setOperationType("MISSING_VALUES");
            imputeOp.setStrategy("impute_mean");
            imputeOp.setColumnName("Unit_Price");
            ops4.add(imputeOp);

            CleaningResult res4 = cleaner.processCleaning(originalData, analysis, ops4);
            int priceColIdx = res4.getHeaders().indexOf("Unit_Price");
            boolean noMissingPrice = true;
            for (List<String> row : res4.getRows()) {
                String val = row.get(priceColIdx);
                if (val == null || val.trim().isEmpty()) {
                    noMissingPrice = false;
                    break;
                }
            }
            if (noMissingPrice && res4.getAffectedCellsCount() > 0) {
                passed++;
                System.out.println("PASS: Test 4 - Missing value imputation filled blank Unit_Price values with column mean.");
            } else {
                System.err.println("FAIL: Test 4 - Missing value imputation failed.");
            }

            // Test 5: Outlier Capping (Tukey IQR)
            List<CleaningOperation> ops5 = new ArrayList<>();
            CleaningOperation outlierOp = new CleaningOperation();
            outlierOp.setOperationType("OUTLIERS");
            outlierOp.setStrategy("cap_iqr");
            outlierOp.setColumnName("Unit_Price");
            ops5.add(outlierOp);

            CleaningResult res5 = cleaner.processCleaning(originalData, analysis, ops5);
            boolean cappedExtreme = true;
            for (List<String> row : res5.getRows()) {
                try {
                    double p = Double.parseDouble(row.get(priceColIdx));
                    if (p > 500.0) { // original had 9999.00
                        cappedExtreme = false;
                    }
                } catch (Exception ignored) {}
            }
            if (cappedExtreme && res5.getChangedCellCoordinates().size() > 0) {
                passed++;
                System.out.println("PASS: Test 5 - Outlier remediation capped 9999.00 to Tukey IQR upper bound.");
            } else {
                System.err.println("FAIL: Test 5 - Outlier capping failed.");
            }

            // Test 6: Column Management (Drop & Rename)
            List<CleaningOperation> ops6 = new ArrayList<>();
            CleaningOperation renameOp = new CleaningOperation();
            renameOp.setOperationType("COLUMN_MANAGEMENT");
            renameOp.setAction("rename");
            renameOp.setColumnName("Delivery_Days");
            renameOp.setNewColumnName("Shipping_Days");
            ops6.add(renameOp);

            CleaningOperation dropOp = new CleaningOperation();
            dropOp.setOperationType("COLUMN_MANAGEMENT");
            dropOp.setAction("drop");
            dropOp.setColumnName("Feedback_Rating");
            ops6.add(dropOp);

            CleaningResult res6 = cleaner.processCleaning(originalData, analysis, ops6);
            if (res6.getHeaders().contains("Shipping_Days") &&
                !res6.getHeaders().contains("Delivery_Days") &&
                !res6.getHeaders().contains("Feedback_Rating") &&
                res6.getCleanedColumnCount() == 12) {
                passed++;
                System.out.println("PASS: Test 6 - Column management renamed Delivery_Days to Shipping_Days and dropped Feedback_Rating.");
            } else {
                System.err.println("FAIL: Test 6 - Column management failed. Headers: " + res6.getHeaders());
            }

            // Test 7: Multi-Step Sequential Staged Pipeline with Cell Diff Tracking
            List<CleaningOperation> pipeline = new ArrayList<>();
            pipeline.add(dupOp);
            pipeline.add(specialOp);
            pipeline.add(imputeOp);
            pipeline.add(outlierOp);
            pipeline.add(renameOp);

            CleaningResult pipeRes = cleaner.processCleaning(originalData, analysis, pipeline);
            if (pipeRes.getCleanedRowCount() == 30 &&
                pipeRes.getHeaders().contains("Shipping_Days") &&
                pipeRes.getRows().size() == 30 &&
                pipeRes.getPreviewRows().size() == 30 &&
                pipeRes.getChangedCellCoordinates().size() > 0 &&
                !pipeRes.getCellChanges().isEmpty()) {
                passed++;
                System.out.println("PASS: Test 7 - Multi-step sequential staged pipeline produced full transformed preview with changed-cell diffs.");
            } else {
                System.err.println("FAIL: Test 7 - Multi-step pipeline failed.");
            }

            System.out.println("\nCleaning Studio Test Results: " + passed + "/" + total + " PASSED.");
            if (passed == total) {
                System.out.println("ALL JAVA CLEANING STUDIO TESTS PASSED SUCCESSFULLY!");
            } else {
                System.exit(1);
            }

        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
    }
}
