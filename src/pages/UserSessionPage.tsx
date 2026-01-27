import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import UserNavbar from '../components/UserNavbar'
import { useUserSession } from '../context/UserSessionContext'
import '../styles/SimplePage.css'

const UserSessionPage = () => {
  const navigate = useNavigate()
  const { setSessionId } = useUserSession()
  const [userId, setUserId] = useState<string | null>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)

  // Get userId from localStorage and redirect to login if not found
  useEffect(() => {
    const currentUser = localStorage.getItem('currentUser')
    if (!currentUser) {
      navigate('/login')
    } else {
      setUserId(currentUser)
    }
  }, [navigate])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError('')
    setUploadedFileName(null)

    const fileName = file.name.toLowerCase()
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')

    if (!isExcel) {
      setError('Please upload an Excel file (.xlsx or .xls)')
      return
    }

    setUploadedFileName(file.name)
    setUploadedFile(file)
  }

  const handleSubmit = async () => {
    if (!userId) {
      setError('User ID is required')
      return
    }

    if (!uploadedFile) {
      setError('Please upload a file before submitting.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', uploadedFile)
      formData.append('user_id', userId)

      const response = await axios.post(
        `http://localhost:5000/user-sessions/${userId}/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      )

      if (response.data.success) {
        const newSessionId = response.data.sessionId
        setSessionId(newSessionId)
        // Navigate to prediction page
        navigate('/user/session/predictions')
      } else {
        setError(response.data.error || 'Failed to upload file.')
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err) && err.response?.data?.error
        ? err.response.data.error
        : 'Error uploading file.'
      setError(errorMessage)
      console.error('Upload error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!userId) {
    return null // Will redirect via useEffect
  }

  return (
    <div className="page-container">
      <UserNavbar title="Create New Session" />

      <div className="dashboard-content">
        <div className="welcome-section">
          <p className="welcome-text">Upload Patient Data for Batch Prediction</p>
          <p className="welcome-subtitle">
            Upload an Excel file with patient clinical data to create a session and generate predictions
          </p>
        </div>

        <div className="session-form-container">
          <div className="form-section">
            <h3>Step 1: Select Excel File</h3>
            <p className="section-help">Upload an Excel file containing patient clinical data with columns: ID, age, gender, BMI, etc.</p>
            
            <label className="file-input-label">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="file-input"
                disabled={loading}
              />
              <span className="file-input-display">
                {uploadedFileName
                  ? `Selected: ${uploadedFileName}`
                  : 'Click to upload or drag and drop'}
              </span>
            </label>

            {uploadedFileName && (
              <div className="success-message">✓ File successfully selected</div>
            )}

            <p className="file-hint">Supported formats: Excel (.xlsx, .xls)</p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="submit-button-wrapper">
            <button
              onClick={handleSubmit}
              disabled={loading || !uploadedFile}
              className="submit-button"
            >
              {loading ? 'Creating Session...' : 'Create Session & Upload'}
            </button>
          </div>
        </div>

        <div className="info-section">
          <h3>What happens next?</h3>
          <ul>
            <li>Your data will be uploaded and saved in a session folder</li>
            <li>Batch predictions will be triggered for all patients in the file</li>
            <li>Results will be saved and displayed in the prediction dashboard</li>
            <li>You can view prediction graphs for individual patients</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default UserSessionPage
