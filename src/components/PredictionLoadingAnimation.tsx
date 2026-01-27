import React from 'react'
import '../styles/PredictionLoadingAnimation.css'

interface PredictionLoadingAnimationProps {
  isVisible: boolean
  message?: string
}

const PredictionLoadingAnimation: React.FC<PredictionLoadingAnimationProps> = ({
  isVisible,
  message = 'Generating predictions using multiple regressors...'
}) => {
  if (!isVisible) {
    return null
  }

  return (
    <div className="prediction-loading-overlay">
      <div className="prediction-loading-backdrop"></div>
      <div className="prediction-loading-container">
        <div className="prediction-spinner-wrapper">
          <div className="prediction-spinner">
            <div className="prediction-spinner-ring"></div>
            <div className="prediction-spinner-ring"></div>
            <div className="prediction-spinner-ring"></div>
          </div>
        </div>

        <h2 className="prediction-loading-title">Processing Predictions</h2>
        <p className="prediction-loading-message">{message}</p>

        <div className="prediction-progress-bar">
          <div className="prediction-progress-fill"></div>
        </div>

        <div className="prediction-info-section">
          <p className="prediction-loading-subtitle">
            This may take a few moments...
          </p>
          <p className="prediction-explore-message">
            💡 Meantime, feel free to explore other options and come back here anytime!
          </p>
        </div>
      </div>
    </div>
  )
}

export default PredictionLoadingAnimation
