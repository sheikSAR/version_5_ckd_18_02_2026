import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import UserNavbar from '../components/UserNavbar'
import { useUserSession } from '../context/UserSessionContext'
import '../styles/SimplePage.css'

interface PatientPrediction {
  Patient_ID: string
  Predictions: Record<string, number>
  Classifier1: {
    label: string
    probability: number
  }
  Classifier2: Record<string, { label: string; probability: number }>
}

interface PredictionsData {
  [key: string]: PatientPrediction
}

const UserSessionPredictionPage = () => {
  const navigate = useNavigate()
  const { sessionId } = useUserSession()
  const [userId, setUserId] = useState<string | null>(null)
  const [predictions, setPredictions] = useState<PredictionsData | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPredicting, setIsPredicting] = useState(false)
  const [error, setError] = useState('')
  const [predictionProgress, setPredictionProgress] = useState(0)

  // Get userId from localStorage and redirect if missing
  useEffect(() => {
    const currentUser = localStorage.getItem('currentUser')
    if (!currentUser) {
      navigate('/login')
    } else {
      setUserId(currentUser)
    }
  }, [navigate])

  // Redirect if no sessionId
  useEffect(() => {
    if (userId && !sessionId) {
      navigate('/user')
    }
  }, [userId, sessionId, navigate])

  // Trigger predictions when component mounts
  useEffect(() => {
    if (userId && sessionId) {
      triggerPredictions()
    }
  }, [userId, sessionId])

  const triggerPredictions = useCallback(async () => {
    if (!userId || !sessionId) return

    setIsPredicting(true)
    setPredictionProgress(10)
    setError('')

    try {
      // Trigger prediction
      const triggerResponse = await axios.post(
        `http://localhost:5000/user-sessions/${userId}/${sessionId}/predict`,
        {}
      )

      if (!triggerResponse.data.success) {
        setError('Failed to start predictions')
        setIsPredicting(false)
        return
      }

      setPredictionProgress(30)

      // Poll for predictions
      let predictionsExist = false
      let pollCount = 0
      const maxPolls = 60 // 60 seconds max wait

      while (!predictionsExist && pollCount < maxPolls) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        pollCount++
        setPredictionProgress(30 + (pollCount / maxPolls) * 60)

        try {
          const checkResponse = await axios.get(
            `http://localhost:5000/user-sessions/${userId}/${sessionId}/check-predictions`
          )
          predictionsExist = checkResponse.data.exists
        } catch (err) {
          console.error('Error checking predictions:', err)
        }
      }

      if (!predictionsExist) {
        setError('Predictions took too long. Please refresh the page.')
        setIsPredicting(false)
        return
      }

      setPredictionProgress(95)

      // Fetch predictions
      const predictionsResponse = await axios.get(
        `http://localhost:5000/user-sessions/${userId}/${sessionId}/output/predictions.json`
      )

      setPredictions(predictionsResponse.data)
      setPredictionProgress(100)

      // Auto-select first patient if available
      const patientIds = Object.keys(predictionsResponse.data)
      if (patientIds.length > 0) {
        setSelectedPatient(patientIds[0])
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err) && err.response?.data?.error
        ? err.response.data.error
        : 'Error generating predictions'
      setError(errorMessage)
      console.error('Prediction error:', err)
    } finally {
      setIsPredicting(false)
      setPredictionProgress(0)
    }
  }, [userId, sessionId])

  const handleRefresh = () => {
    setPredictions(null)
    setSelectedPatient(null)
    triggerPredictions()
  }

  if (!userId || !sessionId) {
    return null
  }

  return (
    <div className="page-container">
      <UserNavbar title="Session Predictions" />

      <div className="dashboard-content">
        {isPredicting && (
          <div className="prediction-status">
            <div className="spinner"></div>
            <p>Generating predictions for all patients...</p>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${predictionProgress}%` }}></div>
            </div>
            <p className="progress-text">{predictionProgress}%</p>
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
            <button className="retry-button" onClick={handleRefresh}>
              Retry
            </button>
          </div>
        )}

        {predictions && (
          <div className="predictions-container">
            <div className="predictions-header">
              <h2>Batch Prediction Results</h2>
              <p>Total patients: {Object.keys(predictions).length}</p>
            </div>

            <div className="predictions-layout">
              {/* Patient List */}
              <div className="patients-list-section">
                <h3>Patients</h3>
                <div className="patients-list">
                  {Object.keys(predictions).map((patientId) => (
                    <button
                      key={patientId}
                      className={`patient-item ${selectedPatient === patientId ? 'active' : ''}`}
                      onClick={() => setSelectedPatient(patientId)}
                    >
                      {patientId}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prediction Details */}
              {selectedPatient && predictions[selectedPatient] && (
                <div className="prediction-details-section">
                  <div className="patient-header">
                    <h3>{selectedPatient}</h3>
                  </div>

                  <div className="predictions-grid">
                    <div className="prediction-card">
                      <h4>Regressor Predictions (EGFR)</h4>
                      <div className="prediction-values">
                        {Object.entries(
                          predictions[selectedPatient].Predictions
                        ).map(([modelName, value]) => (
                          <div key={modelName} className="prediction-row">
                            <span className="model-name">{modelName}</span>
                            <span className="prediction-value">
                              {typeof value === 'number' ? value.toFixed(2) : value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="prediction-card">
                      <h4>Classifier 1 (Clinical + Image)</h4>
                      <div className="classifier-result">
                        <div className="classifier-label">
                          {predictions[selectedPatient].Classifier1.label}
                        </div>
                        <div className="classifier-probability">
                          {(
                            predictions[selectedPatient].Classifier1.probability * 100
                          ).toFixed(1)}
                          % confidence
                        </div>
                      </div>
                    </div>

                    <div className="prediction-card">
                      <h4>Classifier 2 (Regressor-based Ensemble)</h4>
                      <div className="classifier2-results">
                        {Object.entries(
                          predictions[selectedPatient].Classifier2
                        ).map(([modelName, result]) => (
                          <div key={modelName} className="classifier2-item">
                            <span className="model-name">{modelName}</span>
                            <span className="label">{result.label}</span>
                            <span className="probability">
                              {(result.probability * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="actions-section">
              <button className="action-button" onClick={handleRefresh}>
                Generate New Predictions
              </button>
              <button
                className="action-button secondary"
                onClick={() => navigate('/user')}
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default UserSessionPredictionPage
