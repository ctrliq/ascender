import React, { useCallback, useContext, useEffect, useMemo } from 'react';
import { useMatch } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import {
  ConfigAPI,
  MeAPI,
  RootAPI,
  SettingsAPI,
  UsersAPI,
  OrganizationsAPI,
} from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { dynamicActivate, locales } from 'i18nLoader';
import { setCustomTheme, applyTheme, getSavedThemeId } from 'themeRegistry';
import { useSession } from './Session';

/**
 * What the config context carries. Assembled from several endpoints in the
 * provider below, which is why it is declared here rather than taken from a
 * single generated schema.
 */
export interface ConfigValue {
  me?: Record<string, unknown>;
  license_info?: Record<string, unknown>;
  version?: string;
  toJSON?: () => string;
  isLoading?: boolean;
  request?: () => void;
  [key: string]: unknown;
}

export const ConfigContext = React.createContext<ConfigValue>({});
ConfigContext.displayName = 'ConfigContext';

export const Config = ConfigContext.Consumer;
export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};

export const ConfigProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { logout } = useSession();

  const {
    error: configError,
    isLoading,
    request,
    result: config,
  } = useRequest<ConfigValue>(
    useCallback(async (): Promise<ConfigValue> => {
      const [
        { data },
        {
          data: meData,
        },
        { data: rootDataRaw },
      ] = await Promise.all([ConfigAPI.read(), MeAPI.read(), RootAPI.read()]);
      const rootData = (rootDataRaw ?? {}) as Record<string, unknown>;
      const [me] = (meData as { results: Record<string, unknown>[] }).results;
      let systemConfig: Record<string, unknown> = {};
      if (me?.is_superuser || me?.is_system_auditor) {
        const { data: systemConfigResults } = await SettingsAPI.readSystem();
        systemConfig = systemConfigResults as Record<string, unknown>;
      }

      let uiConfig: Record<string, unknown> = {};
      try {
        const { data: uiConfigResults } = await SettingsAPI.readCategory('ui');
        uiConfig = uiConfigResults as Record<string, unknown>;
      } catch (e) {
        uiConfig = {};
      }

      // The themes that ship with the product are bundled at build time, so an
      // administrator's own stylesheet can only arrive here, once the settings
      // have loaded. Install it and then re-apply the saved choice.
      //
      // The saved id is read from localStorage rather than through
      // getStoredThemeId, which prefers sessionStorage. App.js applies the
      // stored theme before these settings exist, so a saved custom theme is
      // unknown at that point and applyTheme falls back to the default, writing
      // "default" into sessionStorage as it goes. Reading the session value back
      // here would return that fallback and the custom theme would never appear.
      // localStorage still holds the real preference, because that early call
      // does not persist.
      setCustomTheme(
        uiConfig.CUSTOM_THEME as string,
        uiConfig.CUSTOM_THEME_NAME as string
      );
      applyTheme(getSavedThemeId());

      const [
        { data: adminOrgData },
        { data: notifAdminData },
        { data: execEnvAdminData },
      ] = await Promise.all([
        UsersAPI.readAdminOfOrganizations(me?.id as number),
        OrganizationsAPI.read({
          page_size: 1,
          role_level: 'notification_admin_role',
        }),
        OrganizationsAPI.read({
          page_size: 1,
          role_level: 'execution_environment_admin_role',
        }),
      ]);
      const { count: adminOrgCount } = adminOrgData as { count: number };
      const { count: notifAdminCount } = notifAdminData as { count: number };
      const { count: execEnvAdminCount } = execEnvAdminData as {
        count: number;
      };
      if (
        me?.preferred_language &&
        Object.keys(locales).includes(me.preferred_language as string)
      ) {
        localStorage.setItem(
          'preferred_language',
          me.preferred_language as string
        );
        await dynamicActivate(me.preferred_language as string);
      } else {
        localStorage.removeItem('preferred_language');
        const browserLang = (navigator.language || '')
          .toLowerCase()
          .split(/[_-]+/)[0];
        await dynamicActivate(
          Object.keys(locales).includes(browserLang ?? '')
            ? (browserLang as string)
            : 'en'
        );
      }
      return {
        ...(data as Record<string, unknown>),
        me,
        adminOrgCount,
        notifAdminCount,
        execEnvAdminCount,
        systemConfig,
        uiConfig,
        custom_logo: uiConfig.CUSTOM_LOGO || rootData.custom_logo,
        custom_header_logo:
          uiConfig.CUSTOM_HEADER_LOGO || rootData.custom_header_logo,
        custom_title: uiConfig.CUSTOM_TITLE || rootData.custom_title,
        custom_theme: uiConfig.CUSTOM_THEME,
        custom_theme_name: uiConfig.CUSTOM_THEME_NAME,
      };
    }, []),
    {
      adminOrgCount: 0,
      notifAdminCount: 0,
      execEnvAdminCount: 0,
      systemConfig: {},
      uiConfig: {},
    }
  );

  const { error, dismissError } = useDismissableError(configError);

  useEffect(() => {
    request();
  }, [request]);

  useEffect(() => {
    if ((error as { response?: { status?: number } })?.response?.status === 401) {
      logout();
    }
  }, [error, logout]);

  const value = useMemo(
    () => ({ ...config, request, isLoading }),
    [config, request, isLoading]
  );

  const { t } = useLingui();
  return (
    <ConfigContext.Provider value={value}>
      {Boolean(error) && (
        <AlertModal
          isOpen={Boolean(error)}
          variant="error"
          title={t`Error!`}
          onClose={dismissError}
          ouiaId="config-error-modal"
        >
          {t`Failed to retrieve configuration.`}
          <ErrorDetail error={error as Error} />
        </AlertModal>
      )}
      {children}
    </ConfigContext.Provider>
  );
};

export const useUserProfile = () => {
  const config = useConfig();
  return {
    isSuperUser: !!config.me?.is_superuser,
    isSystemAuditor: !!config.me?.is_system_auditor,
    isOrgAdmin: config.adminOrgCount,
    isNotificationAdmin: config.notifAdminCount,
    isExecEnvAdmin: config.execEnvAdminCount,
    systemConfig: config.systemConfig,
  };
};

export const useAuthorizedPath = () => {
  const config = useConfig();
  const subscriptionMgmtRoute = useMatch({
    path: '/subscription_management',
    end: false,
  });
  return !!config.license_info?.valid_key && !subscriptionMgmtRoute;
};
