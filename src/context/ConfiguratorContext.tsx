import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface ConfiguratorContextType {
  configPath: string | null
  setConfigPath: (path: string | null) => void
}

const ConfiguratorContext = createContext<ConfiguratorContextType | undefined>(undefined)

const CONFIG_PATH_KEY = 'configurator_config_path'

export const ConfiguratorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [configPath, setConfigPath] = useState<string | null>(() => {
    // Initialize from localStorage
    try {
      return localStorage.getItem(CONFIG_PATH_KEY) || null
    } catch {
      return null
    }
  })

  // Persist to localStorage whenever configPath changes
  useEffect(() => {
    try {
      if (configPath) {
        localStorage.setItem(CONFIG_PATH_KEY, configPath)
      } else {
        localStorage.removeItem(CONFIG_PATH_KEY)
      }
    } catch {
      // Handle localStorage errors silently
    }
  }, [configPath])

  return (
    <ConfiguratorContext.Provider value={{ configPath, setConfigPath }}>
      {children}
    </ConfiguratorContext.Provider>
  )
}

export const useConfigurator = () => {
  const context = useContext(ConfiguratorContext)
  if (!context) {
    throw new Error('useConfigurator must be used within ConfiguratorProvider')
  }
  return context
}
