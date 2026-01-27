import React from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import UserNavbar from '../components/UserNavbar';
import '../styles/SimplePage.css';

const UserPage = () => {
  const navigate = useNavigate();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="page-container">
      <UserNavbar title="User Dashboard" />

      <div className="dashboard-content">
        <div className="welcome-section">
          <p className="welcome-text">Welcome to the CKD Prediction System</p>
          <p className="welcome-subtitle">
            Analyze single patient records for CKD prediction
          </p>
        </div>

        <div className="actions-grid">
          <div className="action-card">
            <div className="action-icon">🔬</div>
            <h2 className="action-title">Single Patient Prediction</h2>
            <p className="action-description">
              Analyze a single patient's clinical data with optional eye images
              to predict CKD status
            </p>
            <button
              className="action-button"
              onClick={() => navigate('/user/predict')}
            >
              Start Analysis
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
      </div>
    </div>
  );
};

export default UserPage;
