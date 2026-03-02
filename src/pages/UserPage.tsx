import { useState } from 'react';
import UserNavbar from '../components/UserNavbar';
import UserPredictionPage from './UserPredictionPage';
import BulkPredictionPage from './BulkPredictionPage';
import { MicroscopeIcon, DashboardSquare01Icon, FolderUploadIcon } from 'hugeicons-react';
import '../styles/SimplePage.css';

const UserPage = () => {
  // 'overview', 'prediction', or 'bulk-prediction'
  const [activeTab, setActiveTab] = useState<'overview' | 'prediction' | 'bulk-prediction'>('overview');

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
            <button
              className={`sidebar-item ${activeTab === 'bulk-prediction' ? 'active' : ''}`}
              onClick={() => setActiveTab('bulk-prediction')}
            >
              <FolderUploadIcon className="sidebar-icon" />
              <span>Bulk Patient Prediction</span>
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="dashboard-main-content">
          {activeTab === 'overview' && (
            <div className="overview-content">
              <div className="welcome-section">
                <p className="welcome-text">Welcome to the CKD Prediction System</p>
                <p className="welcome-subtitle">
                  Select a tool from the sidebar to begin analyzing patient records.
                </p>
              </div>
            </div>
          )}
          {activeTab === 'prediction' && (
            <div className="prediction-view">
              <UserPredictionPage />
            </div>
          )}
          {activeTab === 'bulk-prediction' && (
            <div className="prediction-view">
              <BulkPredictionPage />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default UserPage;
