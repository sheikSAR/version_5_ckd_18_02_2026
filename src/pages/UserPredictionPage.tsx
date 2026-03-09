import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import PatientInputForm from '../components/PatientInputForm';
import UserGraphRenderer from '../components/UserGraphRenderer';
import { useUserSession } from '../context/UserSessionContext';
import {
  AlertCircleIcon,
  CheckmarkCircle01Icon,
  AiViewIcon,
  UserCircleIcon,
  Image01Icon,
  AnalyticsUpIcon,
  CloudUploadIcon
} from 'hugeicons-react';
import '../styles/UserPredictionPage.css';

interface PatientData {
  patientId: string;
  age: number;
  gender: string;
  Durationofdiabetes: number;
  BMI: number;
  Hypertension: number;
  OHA: number;
  INSULIN: number;
  HBA: number;
  CHO: number;
  TRI: number;
  HB: number;
  DR_Label: number;
  DR_OD_OS: number;
  DR_SEVERITY_OD?: number;
  DR_SEVERITY_OS?: number;
}

interface PredictionResult {
  Patient_ID: string;
  Classifier1: {
    label: string;
    probability: number;
  };
  RandomForest: {
    label: string;
    probability: number;
    model_used: string;
  };
}

const UserPredictionPage = () => {
  const navigate = useNavigate();
  const { setSessionId } = useUserSession();
  const [userId, setUserId] = useState<string | null>(null);
  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [isDataSubmitted, setIsDataSubmitted] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [predictionResult, setPredictionResult] =
    useState<PredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [predictionProgress, setPredictionProgress] = useState(0);
  const [formResetKey, setFormResetKey] = useState(0);

  // Get userId from localStorage
  useEffect(() => {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
      navigate('/login');
    } else {
      setUserId(currentUser);
    }
  }, [navigate]);

  const handlePatientDataSubmit = (data: PatientData) => {
    setPatientData(data);
    setIsDataSubmitted(true);
    setError(null);
    // Smooth scroll to next section
    document
      .querySelector('.image-upload-section')
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleImagesUpload = (files: File[]) => {
    setUploadedImages((prev) => {
      const allFiles = [...prev, ...files];
      const uniqueFiles = Array.from(new Set(allFiles.map(f => f.name)))
        .map(name => allFiles.find(f => f.name === name)!);
      return uniqueFiles.slice(0, 4);
    });
  };

  const removeImage = (indexToRemove: number) => {
    setUploadedImages(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleAnalyze = async () => {
    if (!patientData || !userId) {
      setError(
        'Please fill in the patient clinical data and ensure you are logged in'
      );
      return;
    }

    if (uploadedImages.length > 0 && uploadedImages.length !== 2 && uploadedImages.length !== 4) {
      setError('Please upload exactly 2 or 4 eye images for analysis.');
      return;
    }

    setIsAnalyzing(true);
    setPredictionProgress(10);
    setError(null);

    try {
      // Step 1: Create a user session with patient data
      const patientDataPayload: Record<string, any> = {
        ID: patientData.patientId,
        NAME: 'patient',
        age: patientData.age,
        gender: patientData.gender,
        Hypertension: patientData.Hypertension,
        HBA: patientData.HBA,
        HB: patientData.HB,
        BMI: patientData.BMI,
        Durationofdiabetes: patientData.Durationofdiabetes,
        OHA: patientData.OHA,
        INSULIN: patientData.INSULIN,
        CHO: patientData.CHO,
        TRI: patientData.TRI,
        DR_Label: patientData.DR_Label,
        DR_OD_OS: patientData.DR_OD_OS,
      };

      // Include optional DR_SEVERITY fields if provided
      if (patientData.DR_SEVERITY_OD !== undefined && patientData.DR_SEVERITY_OD !== null && String(patientData.DR_SEVERITY_OD).trim() !== '') {
        patientDataPayload.DR_SEVERITY_OD = patientData.DR_SEVERITY_OD;
      }
      if (patientData.DR_SEVERITY_OS !== undefined && patientData.DR_SEVERITY_OS !== null && String(patientData.DR_SEVERITY_OS).trim() !== '') {
        patientDataPayload.DR_SEVERITY_OS = patientData.DR_SEVERITY_OS;
      }

      const sessionResponse = await axios.post(
        `http://localhost:5000/user-sessions/create-session`,
        {
          user_id: userId,
          data: [patientDataPayload],
        }
      );

      if (!sessionResponse.data.success) {
        setError('Failed to create session');
        setIsAnalyzing(false);
        return;
      }

      const sessionId = sessionResponse.data.sessionId;
      setSessionId(sessionId);
      setPredictionProgress(30);

      // Step 1.5: Upload Images
      if (uploadedImages.length > 0) {
        const formData = new FormData();
        formData.append('session_id', sessionId);
        uploadedImages.forEach((file, index) => {
          formData.append(`image_${index + 1}`, file);
        });

        try {
          const uploadResponse = await axios.post(
            `http://localhost:5000/user-sessions/${userId}/upload`,
            formData,
            {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            }
          );

          if (!uploadResponse.data.success) {
            console.warn('Image upload failed but continuing with clinical data only');
          }
        } catch (uploadErr) {
          console.error('Image upload error:', uploadErr);
          setError('Failed to upload images. Please try again.');
          setIsAnalyzing(false);
          return;
        }
      }

      setPredictionProgress(50);

      // Step 2: Trigger prediction
      const predictResponse = await axios.post(
        `http://localhost:5000/user-sessions/${userId}/${sessionId}/predict-single`,
        { patient_data: patientDataPayload }
      );

      if (!predictResponse.data.success) {
        setError('Failed to start prediction');
        setIsAnalyzing(false);
        return;
      }

      setPredictionProgress(60);

      // Step 3: Poll for predictions
      let predictionsExist = false;
      let pollCount = 0;
      const maxPolls = 60;

      while (!predictionsExist && pollCount < maxPolls) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        pollCount++;
        setPredictionProgress(60 + (pollCount / maxPolls) * 30);

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
        setError('Predictions took too long. Please refresh the page.');
        setIsAnalyzing(false);
        return;
      }

      setPredictionProgress(95);

      // Step 4: Fetch predictions
      const predictionsResponse = await axios.get(
        `http://localhost:5000/user-sessions/${userId}/${sessionId}/output/predictions.json`
      );

      const predictions = predictionsResponse.data;

      // Predictions are now an object indexed by Patient_ID
      if (predictions && typeof predictions === 'object') {
        const patientIds = Object.keys(predictions);
        if (patientIds.length > 0) {
          const firstPatientId = patientIds[0];
          const prediction = predictions[firstPatientId];
          if (prediction) {
            setPredictionResult(prediction);
            setPredictionProgress(100);
            // Scroll to results
            setTimeout(() => {
              document
                .querySelector('.visualization-section')
                ?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          } else {
            setError('No prediction results found');
          }
        } else {
          setError('No predictions available');
        }
      } else {
        setError('Invalid prediction data format');
      }
    } catch (err: any) {
      console.error('Prediction error:', err);
      if (err.response) {
        setError(
          `Server Error: ${err.response.status} - ${err.response.data?.error || err.message}`
        );
      } else if (err.request) {
        setError(
          'Network Error: Could not connect to the server. Please ensure the backend is running.'
        );
      } else {
        setError(`Error: ${err.message}`);
      }
    } finally {
      setIsAnalyzing(false);
      setPredictionProgress(0);
    }
  };

  return (
    <div className="user-prediction-container">
      <div className="prediction-content">
        {/* Section 1: Patient Input */}
        <section
          className={`input-section ${isDataSubmitted ? 'completed' : ''}`}
        >
          <div className="section-header">
            <h2>
              <UserCircleIcon size={24} color="#0f172a" />
              1. Patient Clinical Data
              {isDataSubmitted && (
                <span className="step-checkmark" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <CheckmarkCircle01Icon size={16} /> Saved
                </span>
              )}
            </h2>
            <p className="section-description">
              Enter the patient's clinical information for inference
            </p>
          </div>

          <PatientInputForm
            key={formResetKey}
            onSubmit={handlePatientDataSubmit}
          />
        </section>

        {/* Section 2: Image Upload */}
        <section className="input-section image-upload-section">
          <div className="section-header">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Image01Icon size={24} color="#0f172a" /> 2. Eye Images
            </h2>
            <p className="section-description">
              Upload up to 4 eye images
            </p>
          </div>

          <div className="image-upload-container">
            <ImageUploadZone onFilesSelected={handleImagesUpload} />

            {uploadedImages.length > 0 && (
              <div className="image-previews">
                <h3>Uploaded Images ({uploadedImages.length})</h3>
                <div className="preview-grid">
                  {uploadedImages.map((file, index) => (
                    <div key={index} className="image-preview-item" style={{ position: 'relative' }}>
                      <div className="preview-image">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Upload ${index + 1}`}
                        />
                        <button
                          className="remove-image-button"
                          onClick={(e) => { e.stopPropagation(); removeImage(index); }}
                          title="Remove image"
                        >
                          &times;
                        </button>
                      </div>
                      <p className="image-name">{file.name}</p>
                    </div>
                  ))}
                </div>
                <div className="clear-images-container">
                  <button
                    className="clear-images-button"
                    onClick={(e) => { e.stopPropagation(); setUploadedImages([]); }}
                  >
                    Clear All Images
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 3: Analyze Button */}
        <section className="analyze-section">
          <button
            style={{
              padding: '16px 40px',
              backgroundColor: isAnalyzing || !patientData ? '#e5e7eb' : '#0f172a',
              color: isAnalyzing || !patientData ? '#9ca3af' : 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: isAnalyzing || !patientData ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
            }}
            onClick={handleAnalyze}
            disabled={isAnalyzing || !patientData}
          >
            {isAnalyzing ? (
              <>
                <span className="spinner"></span>
                Analyzing Patient...
              </>
            ) : (
              <><AiViewIcon size={20} /> Analyze Now</>
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
              <p className="progress-text">{predictionProgress}%</p>
            </div>
          )}

          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '15px', borderRadius: '6px', marginTop: '15px', display: 'flex', alignItems: 'flex-start', gap: '10px', maxWidth: '600px', width: '100%' }}>
              <AlertCircleIcon size={20} color="#991b1b" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '14px', lineHeight: '1.5' }}>{error}</div>
            </div>
          )}
        </section>

        {/* Section 4: Prediction Visualization */}
        {predictionResult && (
          <section className="visualization-section">
            <div className="section-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AnalyticsUpIcon size={24} color="#0f172a" /> 3. Prediction Results & Visualization
              </h2>
              <p className="section-description">
                Inference pipeline: Patient → Classifier 1 + Random Forest → CKD
                Prediction
              </p>
            </div>

            <div className="graph-container">
              <UserGraphRenderer
                patientId={predictionResult.Patient_ID}
                classifier1={predictionResult.Classifier1}
                randomForest={predictionResult.RandomForest}
              />
            </div>

            <div className="prediction-summary">
              <h3>Prediction Summary</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: '600' }}>Component</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: '600' }}>CKD Risk</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: '600' }}>Classification</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: '600' }}>Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Classifier 1 Row */}
                    {(() => {
                      const c1 = predictionResult.Classifier1;
                      const isCKD = c1.label?.toLowerCase() === 'ckd';
                      const prob = c1.probability < 50 ? 100 - c1.probability : c1.probability;
                      return (
                        <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa' }}>
                          <td style={{ padding: '12px 16px', fontWeight: '600', color: '#1e293b' }}>Classifier 1</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: isCKD ? '#b91c1c' : '#15803d' }}>
                            {prob.toFixed(1)}%
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{
                              padding: '4px 14px',
                              borderRadius: '20px',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              backgroundColor: isCKD ? '#fee2e2' : '#dcfce7',
                              color: isCKD ? '#b91c1c' : '#15803d'
                            }}>
                              {c1.label}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                            Clinical + Image
                          </td>
                        </tr>
                      );
                    })()}

                    {/* Random Forest Row */}
                    {(() => {
                      const rf = predictionResult.RandomForest;
                      const isCKD = rf.label?.toLowerCase() === 'ckd';
                      const prob = rf.probability;
                      return (
                        <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                          <td style={{ padding: '12px 16px', fontWeight: '600', color: '#1e293b' }}>Random Forest</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: isCKD ? '#b91c1c' : '#15803d' }}>
                            {prob.toFixed(1)}%
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{
                              padding: '4px 14px',
                              borderRadius: '20px',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              backgroundColor: isCKD ? '#fee2e2' : '#dcfce7',
                              color: isCKD ? '#b91c1c' : '#15803d'
                            }}>
                              {rf.label}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                            14 Features
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              className="new-analysis-button"
              onClick={() => {
                setPatientData(null);
                setIsDataSubmitted(false);
                setUploadedImages([]);
                setPredictionResult(null);
                setError(null);
                setFormResetKey(prev => prev + 1);
              }}
            >
              Analyze Another Patient
            </button>
          </section>
        )}
      </div>
    </div>
  );
};

// Image Upload Zone Component
const ImageUploadZone: React.FC<{
  onFilesSelected: (files: File[]) => void;
}> = ({ onFilesSelected }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFilesSelected(files.slice(0, 4)); // Max 4 images
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files.slice(0, 4)); // Max 4 images
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div
      className={`image-upload-zone ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <div className="upload-content">
        <CloudUploadIcon
          size={48}
          color="#9ca3af"
        />
        <p className="upload-title">
          Drag and drop images here or click to select
        </p>
        <p className="upload-subtitle">Up to 4 images (JPEG, PNG)</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className="file-input"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
};

export default UserPredictionPage;
