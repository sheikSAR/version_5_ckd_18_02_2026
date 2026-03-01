import { useState } from 'react';
import UserNavbar from '../components/UserNavbar';
import UserPredictionPage from './UserPredictionPage';
import { MicroscopeIcon, DashboardSquare01Icon } from 'hugeicons-react';
import '../styles/SimplePage.css';

const UserPage = () => {
  // 'overview' or 'prediction'
  const [activeTab, setActiveTab] = useState<'overview' | 'prediction'>('overview');

  return (
    <div className="page-container dashboard-layout">
      <UserNavbar title="User Dashboard" />

      <div className="dashboard-body">
        {/* Sidebar */}
        <aside className="dashboard-sidebar">
          <nav className="sidebar-nav">
            <button
              className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <DashboardSquare01Icon className="sidebar-icon" />
              <span>Overview</span>
            </button>
            <button
              className={`sidebar-item ${activeTab === 'prediction' ? 'active' : ''}`}
              onClick={() => setActiveTab('prediction')}
            >
              <MicroscopeIcon className="sidebar-icon" />
              <span>Single Patient Prediction</span>
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="dashboard-main-content">
          {activeTab === 'overview' ? (
            <div className="overview-content">
              <div className="welcome-section">
                <p className="welcome-text">Welcome to the CKD Prediction System</p>
                <p className="welcome-subtitle">
                  Select a tool from the sidebar to begin analyzing patient records.
                </p>
              </div>
            </div>
          ) : (
            <div className="prediction-view">
              <UserPredictionPage />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default UserPage;
