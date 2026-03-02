import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useUserSession } from '../context/UserSessionContext';
import { AlertCircleIcon, CheckmarkCircle01Icon, DownloadCircle01Icon } from 'hugeicons-react';
import '../styles/UserPredictionPage.css'; // Reuse existing styles

const BulkPredictionPage = () => {
      const navigate = useNavigate();
      const { setSessionId } = useUserSession();
      const [userId, setUserId] = useState<string | null>(null);

      const [excelFile, setExcelFile] = useState<File | null>(null);
      const [imageFiles, setImageFiles] = useState<File[]>([]);

      const [isValidating, setIsValidating] = useState(false);
      const [validationResult, setValidationResult] = useState<{
            warnings: string[];
            errors: string[];
            patientCount: number;
      } | null>(null);

      const [isAnalyzing, setIsAnalyzing] = useState(false);
      const [predictionProgress, setPredictionProgress] = useState(0);
      const [error, setError] = useState<string | null>(null);
      const [predictionResults, setPredictionResults] = useState<Record<string, any> | null>(null);

      useEffect(() => {
            const currentUser = localStorage.getItem('currentUser');
            if (!currentUser) {
                  navigate('/login');
            } else {
                  setUserId(currentUser);
                  const savedResults = localStorage.getItem('bulkPredictionResults');
                  if (savedResults) {
                        try {
                              setPredictionResults(JSON.parse(savedResults));
                        } catch (e) {
                              console.error('Failed to parse saved bulk predictions', e);
                        }
                  }
            }
      }, [navigate]);

      const handleExcelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (e.target.files && e.target.files.length > 0) {
                  setExcelFile(e.target.files[0]);
                  setValidationResult(null); // Reset validation when file changes
            }
      };

      const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (e.target.files && e.target.files.length > 0) {
                  const files = Array.from(e.target.files).filter(f => f.name.match(/\.(jpe?g|png)$/i));
                  setImageFiles(files);
                  setValidationResult(null); // Reset validation when folder changes
            }
      };

      const handleValidate = async () => {
            if (!excelFile) {
                  setError('Please upload an Excel file.');
                  return;
            }
            if (imageFiles.length === 0) {
                  setError('Please select a folder containing images.');
                  return;
            }

            setIsValidating(true);
            setError(null);
            setPredictionResults(null);

            const formData = new FormData();
            formData.append('file', excelFile);

            // Only send image filenames for validation to save bandwidth
            const metadata = imageFiles.map(f => f.name);
            formData.append('image_filenames', JSON.stringify(metadata));

            try {
                  const response = await axios.post('http://localhost:5000/api/validate-bulk-data', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                  });

                  if (response.data.success) {
                        setValidationResult({
                              warnings: response.data.warnings || [],
                              errors: response.data.errors || [],
                              patientCount: response.data.patient_count || 0
                        });
                  }
            } catch (err: any) {
                  console.error('Validation error:', err);
                  if (err.response) {
                        setError(`Validation failed: ${err.response.data?.error || err.message}`);
                  } else {
                        // Handle case where file was modified on disk after selection
                        if (err.message && (err.message.includes('Network Error') || err.message.toLowerCase().includes('read'))) {
                              setError('File read error (Network Error). If you modified the Excel file after selecting it, you MUST re-select it using the Browse button before validating again.');
                        } else {
                              setError(`Failed to connect to backend for validation. Details: ${err.message || ''}`);
                        }
                  }
            } finally {
                  setIsValidating(false);
            }
      };

      const handleAnalyzeBatch = async () => {
            if (!userId || !excelFile || imageFiles.length === 0) return;

            const hasErrorsLocal = validationResult?.errors && validationResult.errors.length > 0;
            const hasWarningsLocal = validationResult?.warnings && validationResult.warnings.length > 0;
            // Safety check: block if there are errors or warnings
            if (hasErrorsLocal || hasWarningsLocal) {
                  setError('Cannot proceed with errors or warnings in validation.');
                  return;
            }

            setIsAnalyzing(true);
            setPredictionProgress(10);
            setError(null);
            setPredictionResults(null);
            localStorage.removeItem('bulkPredictionResults');

            try {
                  // Step 1: Upload and create session
                  const formData = new FormData();
                  formData.append('file', excelFile);

                  // Append all images
                  imageFiles.forEach((file, index) => {
                        formData.append(`bulk_image_${index}`, file);
                  });

                  const uploadResponse = await axios.post(
                        `http://localhost:5000/user-sessions/${userId}/upload-bulk-files`,
                        formData,
                        { headers: { 'Content-Type': 'multipart/form-data' } }
                  );

                  if (!uploadResponse.data.success) {
                        throw new Error(uploadResponse.data.error || 'Failed to upload batch data');
                  }

                  const sessionId = uploadResponse.data.sessionId;
                  setSessionId(sessionId);
                  setPredictionProgress(40);

                  // Step 2: Trigger Prediction
                  const predictResponse = await axios.post(
                        `http://localhost:5000/user-sessions/${userId}/${sessionId}/predict`,
                        {}
                  );

                  if (!predictResponse.data.success) {
                        throw new Error(predictResponse.data.error || 'Failed to start batch prediction');
                  }

                  setPredictionProgress(50);

                  // Step 3: Poll for predictions
                  let predictionsExist = false;
                  let pollCount = 0;
                  const maxPolls = 120; // 2 minutes

                  while (!predictionsExist && pollCount < maxPolls) {
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                        pollCount++;
                        setPredictionProgress(50 + (pollCount / maxPolls) * 45);

                        try {
                              const checkResponse = await axios.get(
                                    `http://localhost:5000/user-sessions/${userId}/${sessionId}/check-predictions`
                              );
                              predictionsExist = checkResponse.data.exists;
                        } catch (err) {
                              console.error('Error checking predictions:', err);
                        }
                  }

                  if (!predictionsExist) {
                        throw new Error('Predictions took too long. Please check the results later.');
                  }

                  setPredictionProgress(95);

                  // Step 4: Fetch predictions
                  const predictionsResponse = await axios.get(
                        `http://localhost:5000/user-sessions/${userId}/${sessionId}/output/predictions.json`
                  );

                  setPredictionResults(predictionsResponse.data);
                  localStorage.setItem('bulkPredictionResults', JSON.stringify(predictionsResponse.data));
                  setPredictionProgress(100);

                  setTimeout(() => {
                        document.querySelector('.results-section')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);

            } catch (err: any) {
                  console.error('Batch analysis error:', err);
                  setError(err.message || 'An error occurred during batch analysis');
            } finally {
                  setIsAnalyzing(false);
                  setPredictionProgress(0);
            }
      };

      const handleDownloadCsv = () => {
            if (!predictionResults) return;
            const csvRows = ['Patient_ID,Tree_(eGFR),Classifier1_Result,Classifier2_Result'];

            Object.keys(predictionResults).forEach(pid => {
                  const res = predictionResults[pid];
                  const egfrPredicted = res.Predictions?.['Tree'] ?? 'N/A';
                  const egfr = typeof egfrPredicted === 'number' ? egfrPredicted.toFixed(2) : egfrPredicted;

                  const c1Risk = res.Classifier1?.probability != null ? `${res.Classifier1.probability}%` : 'N/A';
                  const c1Label = res.Classifier1?.label || 'N/A';

                  let c2Risk = 'N/A';
                  let c2Label = 'N/A';

                  if (res.Classifier2) {
                        if (res.Classifier2['Tree']) {
                              c2Risk = res.Classifier2['Tree'].probability != null ? `${res.Classifier2['Tree'].probability}%` : 'N/A';
                              c2Label = res.Classifier2['Tree'].label || 'N/A';
                        } else {
                              const firstKey = Object.keys(res.Classifier2)[0];
                              if (firstKey) {
                                    c2Risk = res.Classifier2[firstKey].probability != null ? `${res.Classifier2[firstKey].probability}%` : 'N/A';
                                    c2Label = res.Classifier2[firstKey].label || 'N/A';
                              }
                        }
                  }

                  const c1Formatted = `${c1Label} (${c1Risk})`;
                  const c2Formatted = `${c2Label} (${c2Risk})`;

                  csvRows.push(`${pid},${egfr},${c1Formatted},${c2Formatted}`);
            });

            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `batch_predictions_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
      };

      const hasErrors = validationResult?.errors && validationResult.errors.length > 0;
      const hasWarnings = validationResult?.warnings && validationResult.warnings.length > 0;
      const isAnalyzeDisabled = isAnalyzing || isValidating || !validationResult || hasErrors || hasWarnings;

      return (
            <div className="user-prediction-container">
                  <div className="prediction-content">

                        <section className={`input-section ${validationResult ? 'completed' : ''}`}>
                              <div className="section-header">
                                    <h2>1. Bulk Patient Upload</h2>
                                    <p className="section-description">Upload Excel dataset and provide images path</p>
                              </div>

                              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div>
                                          <div className="folder-upload-container" style={{
                                                border: '2px dashed #94a3b8',
                                                borderRadius: '8px',
                                                padding: '20px',
                                                textAlign: 'center',
                                                backgroundColor: '#f8fafc',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '12px'
                                          }}>
                                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                      <polyline points="14 2 14 8 20 8"></polyline>
                                                      <line x1="8" y1="13" x2="16" y2="13"></line>
                                                      <line x1="8" y1="17" x2="16" y2="17"></line>
                                                      <line x1="10" y1="9" x2="8" y2="9"></line>
                                                </svg>
                                                <input
                                                      type="file"
                                                      id="excel-input"
                                                      accept=".xlsx, .xls"
                                                      onChange={handleExcelChange}
                                                      onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                                                      style={{ display: 'none' }}
                                                />
                                                <label htmlFor="excel-input" style={{
                                                      padding: '10px 20px',
                                                      backgroundColor: '#0f172a',
                                                      color: 'white',
                                                      borderRadius: '6px',
                                                      cursor: 'pointer',
                                                      fontWeight: '500',
                                                      boxShadow: '0 2px 4px rgba(15, 23, 42, 0.3)'
                                                }}>
                                                      Browse Excel File
                                                </label>
                                                {excelFile ? (
                                                      <div style={{ color: '#059669', fontWeight: '600', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <CheckmarkCircle01Icon size={20} color="#059669" /> {excelFile.name}
                                                      </div>
                                                ) : (
                                                      <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
                                                            No file selected yet.
                                                      </p>
                                                )}
                                          </div>
                                          <p style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
                                                Select the Excel dataset containing patient clinical records (.xlsx, .xls).
                                          </p>
                                    </div>

                                    <div>
                                          <div className="folder-upload-container" style={{
                                                border: '2px dashed #94a3b8',
                                                borderRadius: '8px',
                                                padding: '20px',
                                                textAlign: 'center',
                                                backgroundColor: '#f8fafc',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '12px'
                                          }}>
                                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                                      <line x1="12" y1="11" x2="12" y2="17"></line>
                                                      <line x1="9" y1="14" x2="15" y2="14"></line>
                                                </svg>

                                                <input
                                                      type="file"
                                                      id="folder-input"
                                                      {...({ webkitdirectory: "", directory: "" } as any)}
                                                      multiple
                                                      onChange={handleFolderSelect}
                                                      onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                                                      style={{ display: 'none' }}
                                                />
                                                <label htmlFor="folder-input" style={{
                                                      padding: '10px 20px',
                                                      backgroundColor: '#0f172a',
                                                      color: 'white',
                                                      borderRadius: '6px',
                                                      cursor: 'pointer',
                                                      fontWeight: '500',
                                                      boxShadow: '0 2px 4px rgba(15, 23, 42, 0.3)'
                                                }}>
                                                      Browse Folder
                                                </label>

                                                {imageFiles.length > 0 ? (
                                                      <div style={{ color: '#059669', fontWeight: '600', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <CheckmarkCircle01Icon size={20} color="#059669" /> {imageFiles.length} images selected
                                                      </div>
                                                ) : (
                                                      <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
                                                            No folder selected yet.
                                                      </p>
                                                )}
                                          </div>
                                          <p style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
                                                Select the local folder containing patient eye images (e.g. ckd001_1.jpg).
                                          </p>
                                    </div>

                                    <button
                                          className={`analyze-button ${isValidating ? 'analyzing' : ''}`}
                                          onClick={handleValidate}
                                          disabled={isValidating || !excelFile || imageFiles.length === 0}
                                          style={{ width: '100%', padding: '12px', fontSize: '16px', marginTop: '10px' }}
                                    >
                                          {isValidating ? 'Validating...' : 'Validate Data'}
                                    </button>

                                    {error && <div className="error-message" style={{ color: 'red', marginTop: '10px' }}>{error}</div>}
                              </div>
                        </section>

                        {validationResult && (
                              <section className="input-section" style={{ borderColor: hasErrors ? 'red' : 'green' }}>
                                    <div className="section-header">
                                          <h2>2. Validation Results</h2>
                                          <p className="section-description">Found {validationResult.patientCount} patients in Excel</p>
                                    </div>

                                    <div style={{ padding: '20px' }}>
                                          {validationResult.errors.length > 0 && (
                                                <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
                                                      <h3 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <AlertCircleIcon size={20} color="#991b1b" /> Errors ({validationResult.errors.length})
                                                      </h3>
                                                      <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                                            {validationResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                                                      </ul>
                                                      <p style={{ marginTop: '10px', fontWeight: 'bold' }}>Please fix these errors before analyzing.</p>
                                                </div>
                                          )}

                                          {validationResult.warnings.length > 0 && (
                                                <div style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '15px', borderRadius: '6px' }}>
                                                      <h3 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <AlertCircleIcon size={20} color="#92400e" /> Warnings ({validationResult.warnings.length})
                                                      </h3>
                                                      <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                                            {validationResult.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                                                      </ul>
                                                </div>
                                          )}

                                          {validationResult.errors.length === 0 && validationResult.warnings.length === 0 && (
                                                <div style={{ color: '#15803d', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                      <CheckmarkCircle01Icon size={20} color="#15803d" /> Validation passed! All patients have valid images and no missing data.
                                                </div>
                                          )}
                                          {(validationResult.errors.length > 0 || validationResult.warnings.length > 0) && (
                                                <div style={{ color: '#b45309', fontWeight: 'bold', marginTop: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                      <AlertCircleIcon size={20} color="#b45309" /> All Validation Errors and Warnings must be resolved to proceed with the analysis.
                                                </div>
                                          )}
                                    </div>
                              </section>
                        )}

                        <section className="analyze-section">
                              <button
                                    className={`analyze-button ${isAnalyzing ? 'analyzing' : ''}`}
                                    onClick={handleAnalyzeBatch}
                                    disabled={isAnalyzeDisabled}
                                    style={{
                                          opacity: isAnalyzeDisabled ? 0.5 : 1,
                                          cursor: isAnalyzeDisabled ? 'not-allowed' : 'pointer'
                                    }}
                              >
                                    {isAnalyzing ? (
                                          <>
                                                <span className="spinner"></span>
                                                Analyzing Batch...
                                          </>
                                    ) : (
                                          'Analyze Batch'
                                    )}
                              </button>

                              {isAnalyzing && predictionProgress > 0 && (
                                    <div className="progress-container">
                                          <div className="progress-bar">
                                                <div
                                                      className="progress-fill"
                                                      style={{ width: `${predictionProgress}%` }}
                                                ></div>
                                          </div>
                                          <p className="progress-text">{Math.round(predictionProgress)}%</p>
                                    </div>
                              )}
                        </section>

                        {predictionResults && (
                              <section className="results-section" style={{ marginTop: '30px', padding: '25px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                          <h2 style={{ fontSize: '20px', color: '#1e293b', margin: 0 }}>Batch Prediction Results</h2>
                                          <button
                                                onClick={handleDownloadCsv}
                                                style={{
                                                      padding: '8px 16px',
                                                      backgroundColor: '#10b981',
                                                      color: 'white',
                                                      border: 'none',
                                                      borderRadius: '6px',
                                                      cursor: 'pointer',
                                                      fontWeight: '600',
                                                      boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
                                                      display: 'flex',
                                                      alignItems: 'center',
                                                      gap: '8px'
                                                }}
                                          >
                                                <DownloadCircle01Icon size={20} /> Download CSV
                                          </button>
                                    </div>

                                    <div style={{ overflowX: 'auto' }}>
                                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                                <thead>
                                                      <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                                                            <th style={{ padding: '12px', color: '#475569' }}>Patient ID</th>
                                                            <th style={{ padding: '12px', color: '#475569' }}>Tree (eGFR)</th>
                                                            <th style={{ padding: '12px', color: '#475569' }}>Classifier 1 Result (Risk%)</th>
                                                            <th style={{ padding: '12px', color: '#475569' }}>Classifier 2 Result (Risk%)</th>
                                                      </tr>
                                                </thead>
                                                <tbody>
                                                      {Object.keys(predictionResults).map((pid) => {
                                                            const res = predictionResults[pid];
                                                            const egfrPredicted = res.Predictions?.['Tree'] ?? 'N/A';
                                                            const egfr = typeof egfrPredicted === 'number' ? egfrPredicted.toFixed(2) : egfrPredicted;

                                                            const c1Risk = res.Classifier1?.probability != null ? `${res.Classifier1.probability}%` : 'N/A';
                                                            const c1Label = res.Classifier1?.label || 'N/A';

                                                            let c2Risk = 'N/A';
                                                            let c2Label = 'N/A';

                                                            if (res.Classifier2) {
                                                                  if (res.Classifier2['Tree']) {
                                                                        c2Risk = res.Classifier2['Tree'].probability != null ? `${res.Classifier2['Tree'].probability}%` : 'N/A';
                                                                        c2Label = res.Classifier2['Tree'].label || 'N/A';
                                                                  } else {
                                                                        const firstKey = Object.keys(res.Classifier2)[0];
                                                                        if (firstKey) {
                                                                              c2Risk = res.Classifier2[firstKey].probability != null ? `${res.Classifier2[firstKey].probability}%` : 'N/A';
                                                                              c2Label = res.Classifier2[firstKey].label || 'N/A';
                                                                        }
                                                                  }
                                                            }

                                                            return (
                                                                  <tr key={pid} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                        <td style={{ padding: '12px', fontWeight: '500' }}>{pid}</td>
                                                                        <td style={{ padding: '12px' }}>{egfr}</td>
                                                                        <td style={{ padding: '12px' }}>
                                                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                    {c1Risk !== 'N/A' && <span style={{ color: '#475569', fontSize: '14px' }}>{c1Risk}</span>}
                                                                                    {c1Label !== 'N/A' && (
                                                                                          <span style={{
                                                                                                padding: '4px 8px',
                                                                                                borderRadius: '12px',
                                                                                                fontSize: '13px',
                                                                                                fontWeight: 'bold',
                                                                                                backgroundColor: c1Label.toLowerCase() === 'ckd' ? '#fee2e2' : '#dcfce7',
                                                                                                color: c1Label.toLowerCase() === 'ckd' ? '#b91c1c' : '#15803d'
                                                                                          }}>
                                                                                                {c1Label}
                                                                                          </span>
                                                                                    )}
                                                                              </div>
                                                                        </td>
                                                                        <td style={{ padding: '12px' }}>
                                                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                    {c2Risk !== 'N/A' && <span style={{ color: '#475569', fontSize: '14px' }}>{c2Risk}</span>}
                                                                                    {c2Label !== 'N/A' && (
                                                                                          <span style={{
                                                                                                padding: '4px 8px',
                                                                                                borderRadius: '12px',
                                                                                                fontSize: '13px',
                                                                                                fontWeight: 'bold',
                                                                                                backgroundColor: c2Label.toLowerCase() === 'ckd' ? '#fee2e2' : '#dcfce7',
                                                                                                color: c2Label.toLowerCase() === 'ckd' ? '#b91c1c' : '#15803d'
                                                                                          }}>
                                                                                                {c2Label}
                                                                                          </span>
                                                                                    )}
                                                                              </div>
                                                                        </td>
                                                                  </tr>
                                                            );
                                                      })}
                                                </tbody>
                                          </table>
                                    </div>
                              </section>
                        )}

                  </div>
            </div>
      );
};

export default BulkPredictionPage;
