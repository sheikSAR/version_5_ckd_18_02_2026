import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import ConfiguratorNavbar from '../components/ConfiguratorNavbar'
import PredictionLoadingAnimation from '../components/PredictionLoadingAnimation'
import AllPatientCanvasGraph from '../components/AllPatientCanvasGraph'
import { useConfigurator } from '../context/ConfiguratorContext'
import '../styles/AllPatientPage.css'

interface PredictionData {
  Patient_ID: string
  Actual_EGFR: number | null
  Predictions: Record<string, number>
  Errors: Record<string, number>
}

const AllPatientPage = () => {
  const navigate = useNavigate()
  const { configPath } = useConfigurator()
  const [loading, setLoading] = useState(false)
  const [predictions, setPredictions] = useState<PredictionData[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [predictionsGenerating, setPredictionsGenerating] = useState(false)
  const [allModelNames, setAllModelNames] = useState<string[]>([])
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const canvasRef = useRef<any>(null)

  useEffect(() => {
    if (!configPath) {
      navigate('/configurator/landing')
      return
    }

    checkAndLoadPredictions()
  }, [configPath, navigate])

  const checkAndLoadPredictions = async () => {
    try {
      setLoading(true)

      // Check if predictions already exist
      const checkResponse = await axios.get('http://localhost:5000/api/check-predictions', {
        params: { configPath }
      })

      if (checkResponse.data.exists) {
        // Load existing predictions
        await loadPredictions()
      } else {
        // Trigger new prediction
        await triggerPrediction()
      }
    } catch (err) {
      setError('Failed to check predictions. Please try again.')
      console.error(err)
      setLoading(false)
    }
  }

  const triggerPrediction = async () => {
    try {
      setPredictionsGenerating(true)
      setError(null)

      // Trigger prediction.py execution
      const response = await axios.post('http://localhost:5000/api/predict', {
        configPath
      })

      if (response.data.success) {
        // Start polling for predictions
        pollForPredictions()
      } else {
        setError(response.data.error || 'Failed to trigger predictions.')
        setPredictionsGenerating(false)
        setLoading(false)
      }
    } catch (err) {
      setError('Error triggering prediction process.')
      console.error(err)
      setPredictionsGenerating(false)
      setLoading(false)
    }
  }

  const pollForPredictions = async () => {
    const maxAttempts = 600 // Poll for max 10 minutes (600 * 1 second)
    let attempts = 0

    const pollInterval = setInterval(async () => {
      attempts++

      try {
        const checkResponse = await axios.get('http://localhost:5000/api/check-predictions', {
          params: { configPath }
        })

        if (checkResponse.data.exists) {
          // Predictions are ready, load them
          clearInterval(pollInterval)
          await loadPredictions()
        } else if (attempts >= maxAttempts) {
          // Timeout
          clearInterval(pollInterval)
          setError('Prediction process timed out after 10 minutes. Please check the server logs.')
          setPredictionsGenerating(false)
          setLoading(false)
        }
      } catch (err) {
        console.error('Error polling for predictions:', err)
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval)
          setError('Error while waiting for predictions.')
          setPredictionsGenerating(false)
          setLoading(false)
        }
      }
    }, 1000) // Poll every 1 second
  }

  const loadPredictions = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/configurator/${configPath}/output/regressor_predictions.json`)

      // Convert object indexed by Patient_ID to array
      const data = Array.isArray(response.data)
        ? response.data
        : Object.values(response.data)

      // Predictions are now already unique (indexed by Patient_ID), so no need to deduplicate
      const deduplicated = data

      // Extract unique model names from predictions
      const models = new Set<string>()
      deduplicated.forEach((patient) => {
        if (patient.Errors) {
          Object.keys(patient.Errors).forEach((modelName) => {
            models.add(modelName)
          })
        }
      })
      const modelNames = Array.from(models).sort()
      setAllModelNames(modelNames)
      setSelectedModels(new Set(modelNames)) // Select all models by default

      setPredictions(deduplicated)
      setPredictionsGenerating(false)
      setLoading(false)
    } catch (err) {
      setError('Failed to load predictions.')
      console.error(err)
      setPredictionsGenerating(false)
      setLoading(false)
    }
  }

  if (loading && !predictions) {
    return (
      <div className="all-patient-page">
        <ConfiguratorNavbar />
        <div className="all-patient-main">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p className="loading-text">Loading predictions...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !predictions) {
    return (
      <div className="all-patient-page">
        <ConfiguratorNavbar />
        <div className="all-patient-main">
          <button
            className="all-patient-back-button"
            onClick={() => navigate('/configurator/dl-graph')}
          >
            ← Back
          </button>
          <div className="error-state">
            <p className="error-message">{error}</p>
            <button
              onClick={checkAndLoadPredictions}
              className="retry-button"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="all-patient-page">
      <ConfiguratorNavbar />
      <PredictionLoadingAnimation isVisible={predictionsGenerating} />

      <div className="all-patient-main">
        {/* Header with model filtering controls */}
        {!loading && predictions && predictions.length > 0 && (
          <div className="all-patient-header">
            <button
              onClick={() => navigate('/configurator/dl-graph')}
              className="graph-back-button"
              title="Back to DL Graph"
            >
              ← Back
            </button>
            <div className="patient-info">
              Displaying <strong>{predictions.length}</strong> patients • <strong>{allModelNames.length}</strong> models
            </div>
            <div className="controls-group">
              <div className="model-filter-control">
                <label>Filter Models:</label>
                <div className="model-dropdown-wrapper">
                  <button
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="model-filter-dropdown-btn"
                    title="Select models to display"
                  >
                    {selectedModels.size === 0
                      ? 'No models'
                      : selectedModels.size === allModelNames.length
                      ? 'All models'
                      : `${selectedModels.size} model${selectedModels.size !== 1 ? 's' : ''}`}
                    <span className="dropdown-arrow">▼</span>
                  </button>
                  {showModelDropdown && (
                    <div className="model-dropdown-menu">
                      {allModelNames.length > 0 && (
                        <>
                          <button
                            className="model-dropdown-item select-all"
                            onClick={() => {
                              if (selectedModels.size === allModelNames.length) {
                                setSelectedModels(new Set())
                              } else {
                                setSelectedModels(new Set(allModelNames))
                              }
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedModels.size === allModelNames.length}
                              onChange={() => {}}
                              className="model-checkbox"
                            />
                            <span className="model-name">Select All</span>
                          </button>
                          <div className="model-dropdown-divider"></div>
                        </>
                      )}
                      {allModelNames.map((modelName) => (
                        <button
                          key={modelName}
                          className="model-dropdown-item"
                          onClick={() => {
                            const updated = new Set(selectedModels)
                            if (updated.has(modelName)) {
                              updated.delete(modelName)
                            } else {
                              updated.add(modelName)
                            }
                            setSelectedModels(updated)
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedModels.has(modelName)}
                            onChange={() => {}}
                            className="model-checkbox"
                          />
                          <span className="model-name">{modelName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="zoom-controls">
                <button className="zoom-btn" title="Zoom Out" onClick={() => {}}>−</button>
                <button className="zoom-btn" title="Fit to Screen" onClick={() => {}}>⤢</button>
                <button className="zoom-btn reset" title="Reset 100%" onClick={() => {}}>1:1</button>
                <button className="zoom-btn" title="Zoom In" onClick={() => {}}>+</button>
              </div>
            </div>
          </div>
        )}

        {/* Canvas container */}
        {!loading && predictions && predictions.length > 0 && (
          <div className="canvas-container">
            <AllPatientCanvasGraph ref={canvasRef} predictions={predictions} selectedModels={Array.from(selectedModels)} loading={false} />
          </div>
        )}

        {!loading && (!predictions || predictions.length === 0) && !error && (
          <div className="empty-state">
            <p className="empty-text">No prediction data available.</p>
          </div>
        )}

        {error && predictions && (
          <div className="error-banner">
            {error}
            <button
              onClick={checkAndLoadPredictions}
              className="retry-button"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default AllPatientPage
