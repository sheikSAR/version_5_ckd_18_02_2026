import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import ConfiguratorNavbar from '../components/ConfiguratorNavbar'
import { useConfigurator } from '../context/ConfiguratorContext'
import CanvasGraphRenderer from '../components/CanvasGraphRenderer'
import '../styles/SinglePatientPage.css'

interface PredictionData {
  Patient_ID: string
  Actual_EGFR: number | null
  Predictions: Record<string, number>
  Errors: Record<string, number>
}

const SinglePatientPage = () => {
  const navigate = useNavigate()
  const { configPath } = useConfigurator()
  const [searchInput, setSearchInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<PredictionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allPredictions, setAllPredictions] = useState<Record<string, PredictionData>>({})
  const [patientsList, setPatientsList] = useState<string[]>([])

  useEffect(() => {
    if (!configPath) {
      navigate('/configurator/landing')
      return
    }

    loadAllPredictions()
  }, [configPath, navigate])

  const loadAllPredictions = async () => {
    try {
      // Load predictions
      const predictionsResponse = await axios.get(
        `http://localhost:5000/configurator/${configPath}/output/regressor_predictions.json`
      )

      // Predictions are now an object indexed by Patient_ID
      const predictionMap: Record<string, PredictionData> = predictionsResponse.data

      setAllPredictions(predictionMap)

      // Extract patient IDs from predictions as the authoritative source
      const patientIds = Object.keys(predictionMap)
      setPatientsList(patientIds)
    } catch (err) {
      console.error('Failed to load predictions:', err)
      setError('Failed to load prediction data. Please try again.')
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    setError(null)

    if (value.trim() === '') {
      setSuggestions([])
      setShowSuggestions(false)
      setSelectedPatient(null)
      return
    }

    // Filter patients based on input
    const filtered = patientsList.filter((patientId) =>
      patientId.toLowerCase().includes(value.toLowerCase())
    )

    setSuggestions(filtered)
    setShowSuggestions(filtered.length > 0)
  }

  const handleSelectSuggestion = (patientId: string) => {
    setSearchInput(patientId)
    setSuggestions([])
    setShowSuggestions(false)

    // Find the patient in all predictions
    if (allPredictions[patientId]) {
      setSelectedPatient(allPredictions[patientId])
    } else {
      setError(`No prediction data found for ${patientId}`)
      setSelectedPatient(null)
    }
  }

  const handleSearch = () => {
    if (!searchInput.trim()) {
      setError('Please enter a patient ID')
      return
    }

    if (allPredictions[searchInput]) {
      setSelectedPatient(allPredictions[searchInput])
      setError(null)
    } else {
      setError(`Patient "${searchInput}" not found in the predictions`)
      setSelectedPatient(null)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <>
      <ConfiguratorNavbar />

      <div className="single-patient-container">
        <div className="single-patient-content">
          <button
            className="back-button"
            onClick={() => navigate('/configurator/dl-graph')}
          >
            ← Back to DL Graph
          </button>

          <h1 className="single-patient-title">Search Patient - eGFR Predictions</h1>
          <p className="single-patient-subtitle">Search for a specific patient to view their prediction details</p>

          <div className="search-section">
            <div className="search-input-wrapper">
              <input
                type="text"
                className="search-input"
                placeholder="Enter patient ID"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyPress={handleKeyPress}
                autoComplete="off"
              />
              <button className="search-button" onClick={handleSearch}>
                Search
              </button>

              {showSuggestions && suggestions.length > 0 && (
                <div className="suggestions-dropdown">
                  {suggestions.map((suggestion) => (
                    <div
                      key={suggestion}
                      className="suggestion-item"
                      onClick={() => handleSelectSuggestion(suggestion)}
                    >
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
          </div>

          {selectedPatient && (
            <div className="patient-result">
              <div className="graph-visualization-container">
                <div className="graph-header">
                  <h2 className="graph-patient-title">Patient {selectedPatient.Patient_ID}</h2>
                  {selectedPatient.Actual_EGFR !== null && (
                    <span className="graph-actual-egfr">
                      Actual eGFR: {selectedPatient.Actual_EGFR}
                    </span>
                  )}
                </div>

                <CanvasGraphRenderer
                  data={{
                    patientId: selectedPatient.Patient_ID,
                    actualEGFR: selectedPatient.Actual_EGFR,
                    models: Object.entries(selectedPatient.Predictions).map(([name, prediction]) => ({
                      name,
                      prediction: prediction as number,
                      error: selectedPatient.Errors[name] || 0,
                    })),
                  }}
                  loading={false}
                />

                <div className="graph-legend">
                  <div className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: '#667eea' }}></div>
                    <span>Patient Node</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: '#764ba2' }}></div>
                    <span>Model Node</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: '#e74c3c' }}></div>
                    <span>Error Range Node</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: '#ef4444' }}></div>
                    <span>CKD Outcome</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: '#10b981' }}></div>
                    <span>NON-CKD Outcome</span>
                  </div>
                  <div className="legend-item">
                    <span style={{ fontSize: '12px', color: '#666' }}>Each model has a unique edge color across all columns</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!selectedPatient && searchInput === '' && (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <p className="empty-state-text">Start typing a patient ID to search for predictions</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default SinglePatientPage
