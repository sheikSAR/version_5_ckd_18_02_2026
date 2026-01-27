import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ConfiguratorNavbar from '../components/ConfiguratorNavbar';
import { useConfigurator } from '../context/ConfiguratorContext';
import '../styles/LandingPage.css';

const LandingPage = () => {
  const navigate = useNavigate();
  const { configPath } = useConfigurator();
  const [fileUploaded, setFileUploaded] = useState(false);
  const [predictionRunning, setPredictionRunning] = useState(false);
  const [predictionComplete, setPredictionComplete] = useState(false);

  useEffect(() => {
    if (configPath) {
      checkFileUploadStatus();
    }
  }, [configPath]);

  const checkFileUploadStatus = async () => {
    try {
      // Check if initial_data.json exists
      const response = await axios.get(
        `http://localhost:5000/configurator/${configPath}/input/initial_data.json`
      );
      if (response.data) {
        setFileUploaded(true);
        // Trigger predictions when page loads
        triggerPredictions();
      }
    } catch (err) {
      setFileUploaded(false);
    }
  };

  const triggerPredictions = async () => {
    if (!configPath) return;

    try {
      setPredictionRunning(true);

      // Check if predictions already exist
      const checkResponse = await axios.get(
        `http://localhost:5000/api/check-predictions?configPath=${configPath}`
      );

      if (checkResponse.data.exists) {
        setPredictionComplete(true);
        setPredictionRunning(false);
        return;
      }

      // Trigger the prediction endpoint
      const response = await axios.post('http://localhost:5000/api/predict', {
        configPath: configPath,
      });

      if (response.data.success) {
        // Poll for prediction completion
        pollForPredictions();
      }
    } catch (err) {
      console.error('Error triggering predictions:', err);
      setPredictionRunning(false);
    }
  };

  const pollForPredictions = async () => {
    const maxAttempts = 120; // 2 minutes max
    let attempts = 0;

    const checkPredictions = async () => {
      try {
        const response = await axios.get(
          `http://localhost:5000/api/check-predictions?configPath=${configPath}`
        );

        if (response.data.exists) {
          setPredictionComplete(true);
          setPredictionRunning(false);
        } else {
          attempts++;
          if (attempts < maxAttempts) {
            // Poll every 1 second
            setTimeout(checkPredictions, 1000);
          } else {
            setPredictionRunning(false);
          }
        }
      } catch (err) {
        console.error('Error checking predictions:', err);
      }
    };

    checkPredictions();
  };

  const getCards = () => [
    {
      id: 1,
      title: 'Data Graph',
      subtitle: 'ER Diagram',
      description: 'Visualize and manage your entity relationship diagrams',
      icon: '📊',
      route: '/configurator/data-graph',
      badge: 'Available',
      disabled: false,
    },
    {
      id: 2,
      title: 'DL Graph',
      subtitle: 'Deep Learning Predictions',
      description: predictionRunning
        ? 'Predictions are being generated...'
        : predictionComplete
          ? 'View eGFR predictions from multiple regressors'
          : fileUploaded
            ? 'Upload data first to generate predictions'
            : 'Upload data first to generate predictions',
      icon: '🧠',
      route: '/configurator/dl-graph',
      badge: predictionRunning
        ? 'Processing'
        : predictionComplete
          ? 'Available'
          : fileUploaded
            ? 'Generating'
            : 'Coming Soon',
      disabled: !predictionComplete,
    },
    {
      id: 3,
      title: 'Filtering',
      subtitle: 'Data Filtering',
      description: 'Set up advanced data filtering rules',
      icon: '🔍',
      route: '/configurator/filtering',
      badge: 'Coming Soon',
      disabled: true,
    },
  ];

  const handleCardClick = (route: string, disabled: boolean) => {
    if (!disabled) {
      navigate(route);
    }
  };

  return (
    <div className="landing-page">
      <ConfiguratorNavbar />
      <div className="landing-container">
        <div className="landing-content">
          <div className="landing-header">
            <h1 className="landing-title">Configuration Workspace</h1>
            <p className="landing-subtitle">
              {!fileUploaded
                ? 'Upload your data first to unlock prediction features'
                : predictionRunning
                  ? '⚡ Running predictions on your data...'
                  : predictionComplete
                    ? 'Data uploaded successfully. Predictions ready. Select a module to explore your data ecosystem'
                    : 'Data uploaded. Generating predictions...'}
            </p>
          </div>

          <div className="cards-grid">
            {getCards().map((card) => (
              <div
                key={card.id}
                className={`card ${card.disabled ? 'disabled' : 'active'}`}
                onClick={() => handleCardClick(card.route, card.disabled)}
              >
                <div
                  className={`card-badge ${card.disabled ? 'badge-disabled' : 'badge-available'}`}
                >
                  {card.badge}
                </div>
                <div className="card-icon">{card.icon}</div>
                <div className="card-content">
                  <h3 className="card-title">{card.title}</h3>
                  <p className="card-subtitle">{card.subtitle}</p>
                  <p className="card-description">{card.description}</p>
                </div>
                {!card.disabled && (
                  <div className="card-footer">
                    <span className="card-action">Explore →</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
