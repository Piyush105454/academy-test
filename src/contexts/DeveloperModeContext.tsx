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

const SYSTEM_DEV_MODE_ID = '00000000-0000-0000-0000-000000000000';

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

  // Load from Supabase & localStorage on mount and listen for Realtime updates
  useEffect(() => {
    let isMounted = true;

    const fetchDevModeSettings = async () => {
      try {
        // 1. Try local cache first for instant render
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached && isMounted) {
          const parsed = JSON.parse(cached);
          setSettings(prev => ({ ...prev, ...parsed }));
        }

        // 2. Fetch global dev mode settings from public system row in `classes` table
        const { data: sysRow, error: sysError } = await supabase
          .from('classes')
          .select('description')
          .eq('id', SYSTEM_DEV_MODE_ID)
          .maybeSingle();

        if (sysError) {
          console.warn('Database error/unreachable during maintenance check:', sysError.message);
          // If database is offline/unreachable due to backend server maintenance, trigger maintenance mode safety
          if (sysError.message?.includes('FetchError') || sysError.message?.includes('Failed to fetch') || sysError.code === 'PGRST000') {
            setSettings(prev => ({
              ...prev,
              isDevMode: true,
              maintenanceMessage: 'WesFellow Hub is currently undergoing database upgrades and backend server maintenance. Please check back shortly.'
            }));
          }
        } else if (sysRow?.description && isMounted) {
          try {
            const remoteSettings = JSON.parse(sysRow.description);
            if (typeof remoteSettings.isDevMode === 'boolean') {
              const merged: DevModeSettings = {
                ...DEFAULT_SETTINGS,
                ...remoteSettings,
              };
              setSettings(merged);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            }
          } catch (e) {}
        }
      } catch (err: any) {
        console.error('Error fetching dev mode settings from Supabase:', err);
        // If network/server is completely down, fallback to maintenance mode safely
        setSettings(prev => ({
          ...prev,
          isDevMode: true,
          maintenanceMessage: 'WesFellow Hub is currently undergoing scheduled platform upgrades and system maintenance.'
        }));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDevModeSettings();

    // 3. Supabase Realtime subscription for instant cross-device maintenance mode lock!
    const channel = supabase
      .channel('dev_mode_sync_classes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'classes',
          filter: `id=eq.${SYSTEM_DEV_MODE_ID}`
        },
        (payload: any) => {
          const newDescription = payload.new?.description;
          if (newDescription) {
            try {
              const remote = JSON.parse(newDescription);
              if (typeof remote.isDevMode === 'boolean') {
                setSettings(prev => {
                  const updated = { ...prev, ...remote };
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                  return updated;
                });
              }
            } catch (e) {}
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const saveSettings = async (updated: DevModeSettings) => {
    setSettings(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('dev_mode_updated'));

      // Sync to public system row in `classes` table so ALL devices and browsers lock out instantly!
      const payloadString = JSON.stringify({
        isDevMode: updated.isDevMode,
        maintenanceMessage: updated.maintenanceMessage,
        estimatedCompletion: updated.estimatedCompletion,
        allowedRoles: updated.allowedRoles,
        lastUpdatedAt: updated.lastUpdatedAt,
      });

      await supabase
        .from('classes')
        .upsert({
          id: SYSTEM_DEV_MODE_ID,
          name: '__SYSTEM_DEV_MODE__',
          description: payloadString,
          email: 'system@wes.com',
          allow_profile_edit: false
        });
    } catch (e) {
      console.error('Failed to save dev mode settings to Supabase:', e);
    }
  };

  const toggleDevMode = async (enabled?: boolean) => {
    const nextState = enabled !== undefined ? enabled : !settings.isDevMode;
    const updated: DevModeSettings = {
      ...settings,
      isDevMode: nextState,
      lastUpdatedAt: new Date().toISOString(),
    };
    await saveSettings(updated);
  };

  const updateSettings = async (newSettings: Partial<DevModeSettings>) => {
    const updated: DevModeSettings = {
      ...settings,
      ...newSettings,
      lastUpdatedAt: new Date().toISOString(),
    };
    await saveSettings(updated);
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
