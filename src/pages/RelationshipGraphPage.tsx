import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import ConfiguratorNavbar from '../components/ConfiguratorNavbar'
import PopulationGraph from '../components/PopulationGraph'
import { useConfigurator } from '../context/ConfiguratorContext'
import '../styles/RelationshipGraphPage.css'

const RelationshipGraphPage = () => {
  const navigate = useNavigate()
  const { configPath, setConfigPath } = useConfigurator()
  const [loading, setLoading] = useState(!configPath)
  const [error, setError] = useState('')

  useEffect(() => {
    // If configPath is not in state, try to fetch the latest session from the backend
    if (!configPath) {
      const fetchLatestSession = async () => {
        try {
          const response = await fetch('http://localhost:5000/configurator/latest-session')
          const data = await response.json()

          if (data.success) {
            setConfigPath(data.sessionFolder)
            setError('')
          } else {
            setError(data.error || 'Configuration input file not found. Please restart configurator setup.')
          }
        } catch (err) {
          setError('Failed to fetch configuration. Please restart configurator setup.')
          console.error(err)
        } finally {
          setLoading(false)
        }
      }

      fetchLatestSession()
    } else {
      setLoading(false)
    }
  }, [configPath, setConfigPath])

  if (loading) {
    return (
      <div className="relationship-graph-page">
        <ConfiguratorNavbar />
        <div className="relationship-graph-main">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p className="loading-text">Loading configuration...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="relationship-graph-page">
        <ConfiguratorNavbar />
        <div className="relationship-graph-main">
          <button
            className="relationship-back-button"
            onClick={() => navigate('/configurator')}
          >
            ← Restart Configurator
          </button>
          <div className="error-state">
            <p className="error-message">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relationship-graph-page">
      <ConfiguratorNavbar />
      <div className="relationship-graph-main">
        <PopulationGraph configPath={configPath || ''} />
      </div>
    </div>
  )
}

export default RelationshipGraphPage
