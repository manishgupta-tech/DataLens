# DataLens — Dataset Quality, Statistics & Analysis Platform

College Web Technology Project — Phase 1 (Frontend Foundation)


## Project Architecture
```
DataLens/
├── pom.xml
├── README.md
├── data/
│   ├── uploads/
│   └── samples/
└── src/
    └── main/
        └── webapp/
            ├── index.html
            ├── css/
            │   ├── style.css
            │   └── dashboard.css
            ├── js/
            │   ├── main.js
            │   ├── upload.js
            │   ├── explorer.js
            │   └── charts.js
            └── WEB-INF/
                └── web.xml
```

## Features Implemented in Phase 1
1. **8 Navigation Modules**:
   - Overview
   - Data Preview
   - Data Quality
   - Statistics
   - Data Explorer
   - Visualization
   - Insights
   - History
2. **CSV File Picker & Drag-and-Drop**:
   - Accepts `.csv` files up to 100 MB
   - Validates file format and rejects invalid types (.txt, .xlsx, .json, etc.)
   - Displays selected file name, MIME type, and formatted size
   - Provides file removal and reset controls
3. **Empty States & Truthful UI**:
   - Displays truthful zero/empty states (`0`, `-`, `No dataset loaded`) without simulated fake data.
