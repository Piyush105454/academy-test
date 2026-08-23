import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DevModeSettings {
  isDevMode: boolean;
  maintenanceMessage: string;
  estimatedCompletion: string;
  allowedRoles: number[];
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
}

interface DeveloperModeContextType {
  isDevMode: boolean;
  maintenanceMessage: string;
  estimatedCompletion: string;
  allowedRoles: number[];
  lastUpdatedBy: string;
  lastUpdatedAt: string;
  loading: boolean;
  toggleDevMode: (enabled?: boolean) => Promise<void>;
  updateSettings: (newSettings: Partial<DevModeSettings>) => Promise<void>;
}

const DEFAULT_SETTINGS: DevModeSettings = {
  isDevMode: false,
  maintenanceMessage: 'WesFellow Hub is currently undergoing scheduled platform upgrades and system maintenance to improve your experience.',
  estimatedCompletion: '',
  allowedRoles: [1],
  lastUpdatedBy: 'System Admin',
  lastUpdatedAt: new Date().toISOString(),
};

const STORAGE_KEY = 'wes_developer_mode_settings';

const DeveloperModeContext = createContext<DeveloperModeContextType | undefined>(undefined);

export function DeveloperModeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DevModeSettings>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(cached) };
      }
    } catch (e) {
      console.warn('Failed to parse dev mode cache:', e);
    }
    return DEFAULT_SETTINGS;
  });

  const [loading, setLoading] = useState(true);

  // Load from Supabase / localStorage on mount
  useEffect(() => {
    let isMounted = true;

    const fetchDevModeSettings = async () => {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached && isMounted) {
          const parsed = JSON.parse(cached);
          setSettings(prev => ({ ...prev, ...parsed }));
        }
      } catch (err) {
        console.error('Error fetching dev mode settings:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDevModeSettings();

    // Listen for storage changes across tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue);
          setSettings(prev => ({ ...prev, ...updated }));
        } catch (err) {
          console.error('Error syncing dev mode state across tabs:', err);
        }
      }
    };

    const handleCustomUpdate = () => {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          setSettings(prev => ({ ...prev, ...JSON.parse(cached) }));
        }
      } catch (err) {
        console.error('Error syncing dev mode custom event:', err);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('dev_mode_updated', handleCustomUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('dev_mode_updated', handleCustomUpdate);
    };
  }, []);

  const saveSettings = (updated: DevModeSettings) => {
    setSettings(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('dev_mode_updated'));
    } catch (e) {
      console.error('Failed to save dev mode settings to localStorage:', e);
    }
  };

  const toggleDevMode = async (enabled?: boolean) => {
    const nextState = enabled !== undefined ? enabled : !settings.isDevMode;
    const updated: DevModeSettings = {
      ...settings,
      isDevMode: nextState,
      lastUpdatedAt: new Date().toISOString(),
    };
    saveSettings(updated);
  };

  const updateSettings = async (newSettings: Partial<DevModeSettings>) => {
    const updated: DevModeSettings = {
      ...settings,
      ...newSettings,
      lastUpdatedAt: new Date().toISOString(),
    };
    saveSettings(updated);
  };

  return (
    <DeveloperModeContext.Provider
      value={{
        isDevMode: settings.isDevMode,
        maintenanceMessage: settings.maintenanceMessage,
        estimatedCompletion: settings.estimatedCompletion,
        allowedRoles: settings.allowedRoles,
        lastUpdatedBy: settings.lastUpdatedBy || 'System Admin',
        lastUpdatedAt: settings.lastUpdatedAt || new Date().toISOString(),
        loading,
        toggleDevMode,
        updateSettings,
      }}
    >
      {children}
    </DeveloperModeContext.Provider>
  );
}

export function useDeveloperMode() {
  const context = useContext(DeveloperModeContext);
  if (!context) {
    throw new Error('useDeveloperMode must be used within a DeveloperModeProvider');
  }
  return context;
}
