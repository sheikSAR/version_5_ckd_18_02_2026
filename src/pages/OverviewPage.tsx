import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import UserGraphRenderer from '../components/UserGraphRenderer';
import '../styles/OverviewPage.css';

interface SessionInfo {
      session_id: string;
      is_bulk: boolean;
      has_predictions: boolean;
      created_at: string;
      patient_count: number;
}

interface PredictionData {
      Patient_ID: string;
      Level1_Tree_EGFR?: number | null;
      Level1_Classifier2?: { label: string; probability: number } | null;
      Predictions: Record<string, number>;
      Classifier1: { label: string; probability: number };
      Classifier2: Record<string, { label: string; probability: number }>;
}

const OverviewPage: React.FC = () => {
      const [sessions, setSessions] = useState<SessionInfo[]>([]);
      const [loading, setLoading] = useState(true);
      const [expandedSession, setExpandedSession] = useState<string | null>(null);
      const [sessionPredictions, setSessionPredictions] = useState<Record<string, Record<string, PredictionData>>>({});
      const [loadingPredictions, setLoadingPredictions] = useState<string | null>(null);
      const [selectedAnalysis, setSelectedAnalysis] = useState<{ sessionId: string; patientId: string } | null>(null);

      const userId = 'user1';

      // Fetch sessions on mount
      useEffect(() => {
            const fetchSessions = async () => {
                  try {
                        const resp = await axios.get(`http://localhost:5000/user-sessions/${userId}/list-sessions`);
                        if (resp.data.success) {
                              setSessions(resp.data.sessions);
                        }
                  } catch (err) {
                        console.error('Failed to fetch sessions:', err);
                  } finally {
                        setLoading(false);
                  }
            };
            fetchSessions();
      }, []);

      // Toggle expand session & load predictions
      const handleToggleSession = useCallback(async (sessionId: string) => {
            if (expandedSession === sessionId) {
                  setExpandedSession(null);
                  setSelectedAnalysis(null);
                  return;
            }

            setExpandedSession(sessionId);
            setSelectedAnalysis(null);

            // Load predictions if not cached
            if (!sessionPredictions[sessionId]) {
                  setLoadingPredictions(sessionId);
                  try {
                        const resp = await axios.get(`http://localhost:5000/user-sessions/${userId}/${sessionId}/output/predictions.json`);
                        setSessionPredictions(prev => ({ ...prev, [sessionId]: resp.data }));
                  } catch (err) {
                        console.error('Failed to load predictions:', err);
                        setSessionPredictions(prev => ({ ...prev, [sessionId]: {} }));
                  } finally {
                        setLoadingPredictions(null);
                  }
            }
      }, [expandedSession, sessionPredictions]);

      const formatDate = (isoDate: string) => {
            if (!isoDate) return 'Unknown';
            try {
                  const d = new Date(isoDate);
                  return d.toLocaleString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', hour12: true
                  });
            } catch {
                  return isoDate;
            }
      };

      const renderAnalysis = (prediction: PredictionData) => {
            const isCKDStyle = (label: string) => ({
                  padding: '4px 14px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 'bold' as const,
                  backgroundColor: label?.toLowerCase() === 'ckd' ? '#fee2e2' : '#dcfce7',
                  color: label?.toLowerCase() === 'ckd' ? '#b91c1c' : '#15803d'
            });

            return (
                  <div>
                        {/* Graph */}
                        <div style={{ marginBottom: '24px', background: '#f7fafc', borderRadius: '12px', overflow: 'hidden' }}>
                              <UserGraphRenderer
                                    patientId={prediction.Patient_ID}
                                    predictions={prediction.Predictions}
                                    classifier1={prediction.Classifier1}
                                    classifier2={prediction.Classifier2}
                                    level1TreeEgfr={prediction.Level1_Tree_EGFR ?? undefined}
                                    level1Classifier2={prediction.Level1_Classifier2 ?? undefined}
                              />
                        </div>

                        {/* Summary Table */}
                        <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                    <thead>
                                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: '600' }}>Component</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: '600' }}>Predicted eGFR</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: '600' }}>CKD Risk</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: '600' }}>Classification</th>
                                          </tr>
                                    </thead>
                                    <tbody>
                                          {/* Classifier 1 */}
                                          {(() => {
                                                const c1 = prediction.Classifier1;
                                                const isCKD = c1.label?.toLowerCase() === 'ckd';
                                                const prob = c1.probability < 50 ? 100 - c1.probability : c1.probability;
                                                return (
                                                      <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa' }}>
                                                            <td style={{ padding: '12px 16px', fontWeight: '600', color: '#1e293b' }}>Classifier 1</td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8' }}>—</td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: isCKD ? '#b91c1c' : '#15803d' }}>
                                                                  {prob.toFixed(1)}%
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                  <span style={isCKDStyle(c1.label)}>{c1.label}</span>
                                                            </td>
                                                      </tr>
                                                );
                                          })()}

                                          {/* Level 1 Tree */}
                                          {prediction.Level1_Tree_EGFR != null && (() => {
                                                const egfr = prediction.Level1_Tree_EGFR!;
                                                const isCKD = egfr < 60;
                                                return (
                                                      <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa' }}>
                                                            <td style={{ padding: '12px 16px', fontWeight: '600', color: '#1e293b' }}>Level 1 Tree</td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center', color: '#0369a1', fontWeight: '600' }}>{egfr.toFixed(2)}</td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8' }}>—</td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                  <span style={isCKDStyle(isCKD ? 'CKD' : 'Non-CKD')}>{isCKD ? 'CKD' : 'Non-CKD'}</span>
                                                            </td>
                                                      </tr>
                                                );
                                          })()}

                                          {/* Level 1 Tree + C2 */}
                                          {prediction.Level1_Classifier2 != null && (() => {
                                                const l1c2 = prediction.Level1_Classifier2!;
                                                const isCKD = l1c2.label?.toLowerCase() === 'ckd';
                                                return (
                                                      <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa' }}>
                                                            <td style={{ padding: '12px 16px', fontWeight: '600', color: '#1e293b' }}>Level 1 Tree + C2</td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center', color: '#0369a1', fontWeight: '600' }}>
                                                                  {prediction.Level1_Tree_EGFR?.toFixed(2) ?? '—'}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: isCKD ? '#b91c1c' : '#15803d' }}>
                                                                  {l1c2.probability}%
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                  <span style={isCKDStyle(l1c2.label)}>{l1c2.label}</span>
                                                            </td>
                                                      </tr>
                                                );
                                          })()}

                                          {/* Level 2 separator */}
                                          {prediction.Predictions && Object.keys(prediction.Predictions).length > 0 && (
                                                <tr>
                                                      <td colSpan={4} style={{ padding: '6px 16px', fontSize: '12px', color: '#64748b', fontWeight: '600', backgroundColor: '#f1f5f9', letterSpacing: '0.5px' }}>
                                                            LEVEL 2 REGRESSORS → CLASSIFIER 2
                                                      </td>
                                                </tr>
                                          )}

                                          {/* Level 2 models */}
                                          {prediction.Predictions && Object.entries(prediction.Predictions).map(([modelName, egfrValue]) => {
                                                const c2Result = prediction.Classifier2?.[modelName];
                                                const isCKD = c2Result?.label?.toLowerCase() === 'ckd';
                                                return (
                                                      <tr key={modelName} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                            <td style={{ padding: '12px 16px', fontWeight: '600', color: '#1e293b' }}>{modelName}</td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center', color: '#0369a1', fontWeight: '600' }}>
                                                                  {typeof egfrValue === 'number' ? egfrValue.toFixed(2) : egfrValue}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: isCKD ? '#b91c1c' : '#15803d' }}>
                                                                  {c2Result ? `${c2Result.probability}%` : 'N/A'}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                  {c2Result ? (
                                                                        <span style={isCKDStyle(c2Result.label)}>{c2Result.label}</span>
                                                                  ) : 'N/A'}
                                                            </td>
                                                      </tr>
                                                );
                                          })}
                                    </tbody>
                              </table>
                        </div>
                  </div>
            );
      };

      if (loading) {
            return (
                  <div className="overview-page">
                        <div className="overview-loading">
                              <span>⏳</span> Loading sessions...
                        </div>
                  </div>
            );
      }

      return (
            <div className="overview-page">
                  <div className="overview-header">
                        <h2>Prediction History</h2>
                        <p>View past prediction sessions and their results</p>
                  </div>

                  {sessions.length === 0 ? (
                        <div className="overview-empty">
                              No sessions found. Run a prediction to see results here.
                        </div>
                  ) : (
                        <div className="session-list">
                              {sessions.map(session => {
                                    const isExpanded = expandedSession === session.session_id;
                                    const predictions = sessionPredictions[session.session_id] || {};
                                    const patientIds = Object.keys(predictions);

                                    return (
                                          <div key={session.session_id} className="session-card" style={isExpanded ? { borderColor: '#93c5fd' } : {}}>
                                                {/* Card header */}
                                                <div className="session-card-header" onClick={() => handleToggleSession(session.session_id)}>
                                                      <div className={`session-type-badge ${session.is_bulk ? 'bulk' : 'single'}`}>
                                                            {session.is_bulk ? '📦' : '🔬'}
                                                      </div>
                                                      <div className="session-info">
                                                            <div className="session-title">
                                                                  {session.is_bulk ? 'Bulk Prediction' : 'Single Patient Prediction'}
                                                            </div>
                                                            <div className="session-meta">
                                                                  <span>📅 {formatDate(session.created_at)}</span>
                                                                  <span>👤 {session.patient_count} patient{session.patient_count !== 1 ? 's' : ''}</span>
                                                            </div>
                                                      </div>
                                                      {!session.has_predictions && (
                                                            <span className="no-predictions-badge">No predictions</span>
                                                      )}
                                                      <span className={`session-expand-icon ${isExpanded ? 'open' : ''}`}>▼</span>
                                                </div>

                                                {/* Expanded patient list */}
                                                {isExpanded && session.has_predictions && (
                                                      <div className="session-patients">
                                                            {loadingPredictions === session.session_id ? (
                                                                  <div className="overview-loading" style={{ padding: '20px' }}>
                                                                        <span>⏳</span> Loading predictions...
                                                                  </div>
                                                            ) : selectedAnalysis && selectedAnalysis.sessionId === session.session_id ? (
                                                                  // Show analysis for selected patient
                                                                  <div className="analysis-view">
                                                                        <div className="analysis-nav">
                                                                              <button className="back-btn" onClick={() => setSelectedAnalysis(null)}>
                                                                                    ← Back to patients
                                                                              </button>
                                                                              <span className="analysis-patient-title">
                                                                                    Patient: {selectedAnalysis.patientId}
                                                                              </span>
                                                                        </div>
                                                                        {predictions[selectedAnalysis.patientId] && renderAnalysis(predictions[selectedAnalysis.patientId])}
                                                                  </div>
                                                            ) : (
                                                                  // Show patient list
                                                                  <div className="patient-list">
                                                                        {patientIds.length === 0 ? (
                                                                              <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8' }}>
                                                                                    No patient data found
                                                                              </div>
                                                                        ) : (
                                                                              patientIds.map(pid => (
                                                                                    <div key={pid} className="patient-row">
                                                                                          <span className="patient-id">🏥 {pid}</span>
                                                                                          <button
                                                                                                className="show-analysis-btn"
                                                                                                onClick={() => setSelectedAnalysis({ sessionId: session.session_id, patientId: pid })}
                                                                                          >
                                                                                                Show Analysis
                                                                                          </button>
                                                                                    </div>
                                                                              ))
                                                                        )}
                                                                  </div>
                                                            )}
                                                      </div>
                                                )}

                                                {/* Expanded but no predictions */}
                                                {isExpanded && !session.has_predictions && (
                                                      <div className="session-patients">
                                                            <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8' }}>
                                                                  This session does not have prediction results yet.
                                                            </div>
                                                      </div>
                                                )}
                                          </div>
                                    );
                              })}
                        </div>
                  )}
            </div>
      );
};

export default OverviewPage;
