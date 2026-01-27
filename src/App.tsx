import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { PageLayout } from './components/PageLayout';
import { ConfiguratorProvider } from './context/ConfiguratorContext';
import { UserSessionProvider } from './context/UserSessionContext';
import LoginPage from './pages/LoginPage';
import UserPage from './pages/UserPage';
import UserPredictionPage from './pages/UserPredictionPage';
import UserSessionPage from './pages/UserSessionPage';
import UserSessionPredictionPage from './pages/UserSessionPredictionPage';
import AdminPage from './pages/AdminPage';
import ConfiguratorPage from './pages/ConfiguratorPage';
import LandingPage from './pages/LandingPage';
import DataGraphPage from './pages/DataGraphPage';
import RelationshipGraphPage from './pages/RelationshipGraphPage';
import DLGraphPage from './pages/DLGraphPage';
import AllPatientPage from './pages/AllPatientPage';
import SinglePatientPage from './pages/SinglePatientPage';
import FilteringPage from './pages/FilteringPage';
import MetaGraphPage from './pages/MetaGraphPage';

const AppContent = () => {
  const location = useLocation();

  return (
    <PageLayout key={location.pathname}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/user" element={<UserPage />} />
        <Route path="/user/predict" element={<UserPredictionPage />} />
        <Route path="/user/session" element={<UserSessionPage />} />
        <Route path="/user/session/predictions" element={<UserSessionPredictionPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/configurator" element={<ConfiguratorPage />} />
        <Route path="/configurator/landing" element={<LandingPage />} />
        <Route path="/configurator/data-graph" element={<DataGraphPage />} />
        <Route
          path="/configurator/relationship-graph"
          element={<RelationshipGraphPage />}
        />
        <Route path="/configurator/dl-graph" element={<DLGraphPage />} />
        <Route
          path="/configurator/dl-graph/all-patient"
          element={<AllPatientPage />}
        />
        <Route
          path="/configurator/dl-graph/single-patient"
          element={<SinglePatientPage />}
        />
        <Route path="/configurator/filtering" element={<FilteringPage />} />
        <Route path="/configurator/meta-graph" element={<MetaGraphPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </PageLayout>
  );
};

const App = () => {
  return (
    <ConfiguratorProvider>
      <UserSessionProvider>
        <Router>
          <AppContent />
        </Router>
      </UserSessionProvider>
    </ConfiguratorProvider>
  );
};

export default App;
