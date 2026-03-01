import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import PatientInputForm from '../components/PatientInputForm';
import UserGraphRenderer from '../components/UserGraphRenderer';
import { useUserSession } from '../context/UserSessionContext';
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
  DR_OD_DR_OS?: number;
}

interface PredictionResult {
  Patient_ID: string;
  Predictions: Record<string, number>;
  Classifier1: {
    label: string;
    probability: number;
  };
  Classifier2: Record<string, { label: string; probability: number }>;
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
      const patientDataPayload = {
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
        DR_OD_DR_OS: patientData.DR_OD_DR_OS,
      };

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
          // We continue even if upload fails, but maybe we should stop? 
          // User insisted on image inputs.
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
              1. Patient Clinical Data
              {isDataSubmitted && (
                <span className="step-checkmark">✓ Saved</span>
              )}
            </h2>
            <p className="section-description">
              Enter the patient's clinical information for inference
            </p>
          </div>

          <PatientInputForm
            onSubmit={handlePatientDataSubmit}
          />
        </section>

        {/* Section 2: Image Upload */}
        <section className="input-section image-upload-section">
          <div className="section-header">
            <h2>2. Eye Images</h2>
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
            className={`analyze-button ${isAnalyzing ? 'analyzing' : ''}`}
            onClick={handleAnalyze}
            disabled={isAnalyzing || !patientData}
          >
            {isAnalyzing ? (
              <>
                <span className="spinner"></span>
                Analyzing Patient...
              </>
            ) : (
              'Analyze Now'
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

          {error && <div className="error-message">{error}</div>}
        </section>

        {/* Section 4: Prediction Visualization */}
        {predictionResult && (
          <section className="visualization-section">
            <div className="section-header">
              <h2>3. Prediction Results - DL Graph Visualization</h2>
              <p className="section-description">
                Inference pipeline: Patient → Regressors → Classifiers → CKD
                Prediction
              </p>
            </div>

            <div className="graph-container">
              <UserGraphRenderer
                patientId={predictionResult.Patient_ID}
                predictions={predictionResult.Predictions}
                classifier1={predictionResult.Classifier1}
                classifier2={predictionResult.Classifier2}
              />
            </div>

            <div className="prediction-summary">
              <h3>Prediction Summary</h3>
              <div className="summary-grid">
                <div className="summary-item">
                  <label>Classifier 1 (Clinical + Image Pooling)</label>
                  <div className="summary-value">
                    <span className="label">
                      {predictionResult.Classifier1.label}
                    </span>
                    <span className="probability">
                      {(predictionResult.Classifier1.probability < 50
                        ? 100 - predictionResult.Classifier1.probability
                        : predictionResult.Classifier1.probability).toFixed(1)}
                      %
                    </span>
                  </div>
                </div>
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
        <svg
          className="upload-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
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
