import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ParticleTextEffect } from '../components/ui/particle-text-effect'
import '../styles/LoginPage.css'

const LoginPage = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await axios.post('http://localhost:5000/login', {
        username,
        password,
      })

      if (response.data.success) {
        const role = response.data.role
        localStorage.setItem('currentUser', username)
        if (role === 'user') {
          navigate('/user')
        } else if (role === 'admin') {
          navigate('/admin')
        } else if (role === 'configurator') {
          navigate('/configurator')
        }
      } else {
        setError(response.data.message || 'Login failed. Please try again.')
      }
    } catch (err) {
      setError('Login failed. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      {/* Particle Effect Layer - Full screen, sits over backgrounds but under the form z-index */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5, opacity: 0.9, pointerEvents: 'none' }}>
        <ParticleTextEffect
          words={["EFSD", "MDRF", "SRL", "KARE"]}
          position="center"
          particleColors={["#0f172a", "#1e293b", "#3b82f6", "#0ea5e9", "#06b6d4"]}
        />
      </div>

      {/* Left Branding Panel */}
      <div className="login-branding">
        <div className="branding-content">
          <div className="branding-logos">
            <img
              src="https://res.cloudinary.com/dk2wudmxh/image/upload/v1766678682/EFSD_bbakla.png"
              alt="EFSD Logo"
              className="brand-logo efsd-logo-login"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <img
              src="https://res.cloudinary.com/dk2wudmxh/image/upload/v1765918133/MDRF__Chennai_Logo_qfwlna.png"
              alt="MDRF Logo"
              className="brand-logo"
            />
            <img
              src="https://research.kalasalingam.ac.in/dist/img/logo.png"
              alt="Kalasalingam Logo"
              className="brand-logo"
            />
            <div className="logo-text-lab" style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b', lineHeight: 1.1, marginLeft: '8px', letterSpacing: '-0.5px' }}>
              SESHU'S<br />RESEARCH<br />LAB
            </div>
          </div>

          <div className="branding-text">
            <p className="branding-subtitle" style={{ textShadow: '0px 2px 10px rgba(0, 0, 0, 0.95), 0px 1px 5px rgba(0,0,0,0.8)', color: '#f8fafc', fontWeight: 500 }}>
              Advanced Clinical Prediction System for Chronic Kidney Disease
            </p>
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="login-form-side">
        <div className="login-form-container">
          <div className="form-header">
            <h2 className="form-title">Welcome Back</h2>
            <p className="form-subtitle">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username" className="form-label">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="form-input"
                required
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" disabled={loading} className="login-button">
              {loading ? (
                <>
                  <span className="spinner" style={{
                    width: '18px',
                    height: '18px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginRight: '8px',
                    display: 'inline-block'
                  }}></span>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
