/**
 * DataLens — CSV Upload & File Selection Handler
 * Connects frontend file selection to the Java UploadServlet (/api/upload),
 * validates CSV files up to 100 MB, displays upload progress,
 * and triggers real-time dataset analysis refresh.
 */

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('csv-file-input');
  const dropzone = document.getElementById('dropzone');
  const chooseFileBtn = document.getElementById('btn-choose-file');
  const fileNameDisplay = document.getElementById('selected-file-name');
  const fileTypeDisplay = document.getElementById('selected-file-type');
  const fileSizeDisplay = document.getElementById('selected-file-size');
  const fileActionsWrap = document.getElementById('file-actions-wrap');
  const uploadBtn = document.getElementById('btn-upload-file');
  const removeFileBtn = document.getElementById('btn-remove-file');
  const infoAlertBar = document.getElementById('info-alert-bar');
  const infoAlertText = document.getElementById('info-alert-text');
  const headerDatasetName = document.getElementById('header-dataset-name');

  // Upload Progress Elements
  const progressWrap = document.getElementById('upload-progress-wrap');
  const progressBar = document.getElementById('upload-progress-bar');
  const progressPercent = document.getElementById('upload-progress-percent');
  const progressLabel = document.getElementById('upload-progress-label');

  // Configurable Max Upload File Size: 100 MB (104,857,600 bytes)
  const MAX_FILE_SIZE_MB = 100;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024; // 100 MB

  let currentSelectedFile = null;
  let activeDatasetName = null;
  let isUploading = false;

  /**
   * Resolve application upload endpoint dynamically based on context path
   * @returns {string}
   */
  function getUploadEndpoint() {
    if (window.DataLens && typeof window.DataLens.getApiUrl === 'function') {
      return window.DataLens.getApiUrl('/api/upload');
    }
    const path = window.location.pathname || '';
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 0 && segments[0] !== 'api' && !segments[0].includes('.')) {
      return '/' + segments[0] + '/api/upload';
    }
    return '/api/upload';
  }

  /**
   * Format file size in human-readable units (Bytes, KB, MB, GB)
   * @param {number} bytes
   * @returns {string}
   */
  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    return `${formatted} ${sizes[i]}`;
  }

  /**
   * Show an error or info message in the alert bar
   * @param {string} message
   * @param {boolean} isError
   */
  function setAlertMessage(message, isError = false) {
    if (!infoAlertBar || !infoAlertText) return;
    infoAlertText.textContent = message;
    if (isError) {
      infoAlertBar.style.backgroundColor = '#fef2f2';
      infoAlertBar.style.borderColor = '#fecaca';
      infoAlertBar.style.color = '#b91c1c';
    } else {
      infoAlertBar.style.backgroundColor = '#eff6ff';
      infoAlertBar.style.borderColor = '#bfdbfe';
      infoAlertBar.style.color = '#1d4ed8';
    }
  }

  /**
   * Show upload progress UI
   * @param {number} percent 0 to 100
   * @param {string} labelText
   */
  function showProgress(percent, labelText) {
    if (progressWrap) progressWrap.style.display = 'block';
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressLabel) progressLabel.textContent = labelText || 'Uploading...';
  }

  /**
   * Hide upload progress UI
   */
  function hideProgress() {
    if (progressWrap) progressWrap.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
    if (progressPercent) progressPercent.textContent = '0%';
    if (progressLabel) progressLabel.textContent = 'Uploading...';
  }

  /**
   * Reset file selection state
   */
  function resetFileSelection() {
    currentSelectedFile = null;
    hideProgress();
    if (fileInput) fileInput.value = '';
    if (fileNameDisplay) fileNameDisplay.textContent = 'No file selected';
    if (fileTypeDisplay) fileTypeDisplay.textContent = '-';
    if (fileSizeDisplay) fileSizeDisplay.textContent = '-';
    if (fileActionsWrap) fileActionsWrap.classList.remove('visible');
    
    if (activeDatasetName) {
      setAlertMessage(`Current active dataset: ${activeDatasetName}. Select another CSV to upload (up to ${MAX_FILE_SIZE_MB} MB).`, false);
    } else {
      setAlertMessage('Please upload a CSV file to begin analysis', false);
    }
  }

  /**
   * Validate and handle selected file
   * @param {File} file
   */
  function handleFile(file) {
    if (isUploading) return;
    hideProgress();

    if (!file) {
      resetFileSelection();
      return;
    }

    const fileName = file.name || '';
    const fileExtension = fileName.split('.').pop()?.toLowerCase();

    // Strict validation: Reject non-csv files (.txt, .xlsx, .json, .pdf, etc.)
    if (fileExtension !== 'csv' && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
      resetFileSelection();
      setAlertMessage('Please select a valid CSV file (.csv only).', true);
      return;
    }

    // Empty file check
    if (file.size === 0) {
      resetFileSelection();
      setAlertMessage('Selected CSV file is empty (0 Bytes). Please select a valid CSV with data.', true);
      return;
    }

    // Size limit check (100 MB max)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      resetFileSelection();
      setAlertMessage(`File size exceeds the ${MAX_FILE_SIZE_MB} MB limit (${formatFileSize(file.size)}). Please select a CSV under ${MAX_FILE_SIZE_MB} MB.`, true);
      return;
    }

    currentSelectedFile = file;

    // Display selected file metadata
    if (fileNameDisplay) fileNameDisplay.textContent = fileName;
    if (fileTypeDisplay) fileTypeDisplay.textContent = file.type || 'text/csv';
    if (fileSizeDisplay) fileSizeDisplay.textContent = formatFileSize(file.size);
    if (fileActionsWrap) fileActionsWrap.classList.add('visible');

    setAlertMessage(`File "${fileName}" (${formatFileSize(file.size)}) selected. Click "Upload" to process.`, false);
  }

  /**
   * Upload selected CSV file to the backend servlet (/api/upload)
   * Tracks upload progress and guards against duplicate submissions
   */
  function uploadFileToServer() {
    if (isUploading) return;
    if (!currentSelectedFile) {
      setAlertMessage('Please select a CSV file first.', true);
      return;
    }

    isUploading = true;
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Uploading...';
    }
    if (removeFileBtn) removeFileBtn.disabled = true;
    if (chooseFileBtn) chooseFileBtn.disabled = true;

    showProgress(0, 'Starting upload...');
    setAlertMessage(`Uploading "${currentSelectedFile.name}" to server...`, false);

    const formData = new FormData();
    formData.append('file', currentSelectedFile);
    formData.append('activate', 'true');

    let endpoint = getUploadEndpoint();
    endpoint += (endpoint.includes('?') ? '&' : '?') + 'activate=true';

    const token = sessionStorage.getItem('datalens_session_id') || localStorage.getItem('datalens_session_id');
    if (token) {
      endpoint += '&token=' + encodeURIComponent(token);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    xhr.setRequestHeader('X-Activate-Dataset', 'true');
    if (token) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.setRequestHeader('X-Session-ID', token);
    }
    xhr.withCredentials = true;

    // Upload progress event listener
    if (xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          showProgress(percent, `Uploading dataset (${percent}%)...`);
          if (uploadBtn) uploadBtn.textContent = `Uploading ${percent}%`;
        }
      };

      xhr.upload.onload = () => {
        showProgress(100, 'Processing & profiling CSV dataset...');
        if (uploadBtn) uploadBtn.textContent = 'Processing...';
        setAlertMessage('Server is parsing dataset, computing statistics, and auditing quality...', false);
      };
    }

    xhr.onload = async () => {
      isUploading = false;
      hideProgress();
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload';
      }
      if (removeFileBtn) removeFileBtn.disabled = false;
      if (chooseFileBtn) chooseFileBtn.disabled = false;

      let result;
      try {
        result = JSON.parse(xhr.responseText);
      } catch (e) {
        setAlertMessage('Server returned an unexpected response format.', true);
        return;
      }

      if (xhr.status === 200 && result && result.success) {
        if (result.isActive) {
          activeDatasetName = result.fileName || currentSelectedFile.name;
          if (headerDatasetName) {
            headerDatasetName.textContent = activeDatasetName;
          }
        }
        setAlertMessage(result.message || 'Dataset uploaded successfully.', false);
        resetFileSelection();

        // Trigger complete application state refresh across all tabs
        if (window.DataLens && typeof window.DataLens.refreshAll === 'function') {
          await window.DataLens.refreshAll();
        }
      } else {
        const errorMsg = result?.message || 'Failed to upload dataset.';
        setAlertMessage(errorMsg, true);
      }
    };

    xhr.onerror = () => {
      isUploading = false;
      hideProgress();
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload';
      }
      if (removeFileBtn) removeFileBtn.disabled = false;
      if (chooseFileBtn) chooseFileBtn.disabled = false;
      setAlertMessage('Upload failed: unable to connect to the backend server.', true);
    };

    xhr.send(formData);
  }

  // Trigger file dialog on button click
  if (chooseFileBtn && fileInput) {
    chooseFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isUploading) {
        fileInput.click();
      }
    });
  }

  // Click on dropzone opens file dialog
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => {
      if (!isUploading) {
        fileInput.click();
      }
    });
  }

  // Handle native file input change
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    });
  }

  // Upload button click handler
  if (uploadBtn) {
    uploadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadFileToServer();
    });
  }

  // Drag and drop handlers
  if (dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isUploading) {
          dropzone.classList.add('dragover');
        }
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (isUploading) return;
      const dt = e.dataTransfer;
      const files = dt?.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    });
  }

  // Remove file button
  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isUploading) {
        resetFileSelection();
      }
    });
  }
});
