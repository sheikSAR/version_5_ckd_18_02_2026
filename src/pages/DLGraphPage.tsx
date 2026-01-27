import React from 'react'
import { useNavigate } from 'react-router-dom'
import ConfiguratorNavbar from '../components/ConfiguratorNavbar'
import { useConfigurator } from '../context/ConfiguratorContext'
import '../styles/DLGraphPage.css'

const DLGraphPage = () => {
  const navigate = useNavigate()
  const { configPath } = useConfigurator()

  const handleOptionSelect = (option: 'single' | 'all') => {
    if (!configPath) {
      navigate('/configurator/landing')
      return
    }

    if (option === 'all') {
      navigate('/configurator/dl-graph/all-patient')
    } else {
      navigate('/configurator/dl-graph/single-patient')
    }
  }

  return (
    <>
      <ConfiguratorNavbar />

      <div className="dl-graph-container">
        <div className="dl-graph-content">
          <button
            className="back-button"
            onClick={() => navigate('/configurator/landing')}
          >
            ← Back to Configuration Landing
          </button>

          <div className="dl-graph-header">
            <h1 className="dl-graph-title">DL Graph - eGFR Predictions</h1>
            <p className="dl-graph-subtitle">Choose how you want to view the predictions</p>
          </div>

          <div className="options-grid">
            <div
              className="option-card"
              onClick={() => handleOptionSelect('single')}
            >
              <div className="option-icon">🔍</div>
              <div className="option-content">
                <h3 className="option-title">View Single Patient</h3>
                <p className="option-description">
                  Search for a specific patient by ID and view their prediction details
                </p>
              </div>
              <div className="option-action">Explore →</div>
            </div>

            <div
              className="option-card"
              onClick={() => handleOptionSelect('all')}
            >
              <div className="option-icon">📊</div>
              <div className="option-content">
                <h3 className="option-title">View All Patients</h3>
                <p className="option-description">
                  Browse all patient predictions and compare results across regressors
                </p>
              </div>
              <div className="option-action">Explore →</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default DLGraphPage
