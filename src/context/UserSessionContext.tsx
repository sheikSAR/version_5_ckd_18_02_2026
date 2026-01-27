import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface UserSessionContextType {
  userId: string | null
  sessionId: string | null
  setUserId: (id: string | null) => void
  setSessionId: (id: string | null) => void
}

const UserSessionContext = createContext<UserSessionContextType | undefined>(undefined)

const USER_ID_KEY = 'user_session_user_id'
const SESSION_ID_KEY = 'user_session_session_id'

export const UserSessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [userId, setUserIdState] = useState<string | null>(() => {
    // Initialize from localStorage
    try {
      return localStorage.getItem(USER_ID_KEY) || null
    } catch {
      return null
    }
  })

  const [sessionId, setSessionIdState] = useState<string | null>(() => {
    // Initialize from localStorage
    try {
      return localStorage.getItem(SESSION_ID_KEY) || null
    } catch {
      return null
    }
  })

  // Persist userId to localStorage whenever it changes
  useEffect(() => {
    try {
      if (userId) {
        localStorage.setItem(USER_ID_KEY, userId)
      } else {
        localStorage.removeItem(USER_ID_KEY)
      }
    } catch {
      // Handle localStorage errors silently
    }
  }, [userId])

  // Persist sessionId to localStorage whenever it changes
  useEffect(() => {
    try {
      if (sessionId) {
        localStorage.setItem(SESSION_ID_KEY, sessionId)
      } else {
        localStorage.removeItem(SESSION_ID_KEY)
      }
    } catch {
      // Handle localStorage errors silently
    }
  }, [sessionId])

  return (
    <UserSessionContext.Provider
      value={{
        userId,
        sessionId,
        setUserId: setUserIdState,
        setSessionId: setSessionIdState,
      }}
    >
      {children}
    </UserSessionContext.Provider>
  )
}

export const useUserSession = () => {
  const context = useContext(UserSessionContext)
  if (!context) {
    throw new Error('useUserSession must be used within UserSessionProvider')
  }
  return context
}
