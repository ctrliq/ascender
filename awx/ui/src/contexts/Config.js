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
import { useSession } from './Session';

export const ConfigContext = React.createContext({});
ConfigContext.displayName = 'ConfigContext';

export const Config = ConfigContext.Consumer;
export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};

export const ConfigProvider = ({ children }) => {
  const { logout } = useSession();

  const {
    error: configError,
    isLoading,
    request,
    result: config,
  } = useRequest(
    useCallback(async () => {
      const [
        { data },
        {
          data: {
            results: [me],
          },
        },
        { data: rootData },
      ] = await Promise.all([ConfigAPI.read(), MeAPI.read(), RootAPI.read()]);
      let systemConfig = {};
      if (me?.is_superuser || me?.is_system_auditor) {
        const { data: systemConfigResults } = await SettingsAPI.readSystem();
        systemConfig = systemConfigResults;
      }

      let uiConfig = {};
      try {
        const { data: uiConfigResults } = await SettingsAPI.readCategory('ui');
        uiConfig = uiConfigResults;
      } catch (e) {
        uiConfig = {};
      }

      const [
        {
          data: { count: adminOrgCount },
        },
        {
          data: { count: notifAdminCount },
        },
        {
          data: { count: execEnvAdminCount },
        },
      ] = await Promise.all([
        UsersAPI.readAdminOfOrganizations(me?.id),
        OrganizationsAPI.read({
          page_size: 1,
          role_level: 'notification_admin_role',
        }),
        OrganizationsAPI.read({
          page_size: 1,
          role_level: 'execution_environment_admin_role',
        }),
      ]);
      if (me?.preferred_language && Object.keys(locales).includes(me.preferred_language)) {
        localStorage.setItem('preferred_language', me.preferred_language);
        await dynamicActivate(me.preferred_language);
      } else {
        localStorage.removeItem('preferred_language');
        const browserLang = (navigator.language || '').toLowerCase().split(/[_-]+/)[0];
        await dynamicActivate(Object.keys(locales).includes(browserLang) ? browserLang : 'en');
      }
      return {
        ...data,
        me,
        adminOrgCount,
        notifAdminCount,
        execEnvAdminCount,
        systemConfig,
        uiConfig,
        custom_logo: uiConfig.CUSTOM_LOGO || rootData.custom_logo,
        custom_header_logo: uiConfig.CUSTOM_HEADER_LOGO || rootData.custom_header_logo,
        custom_title: uiConfig.CUSTOM_TITLE || rootData.custom_title,
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
    if (error?.response?.status === 401) {
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
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={t`Error!`}
          onClose={dismissError}
          ouiaId="config-error-modal"
        >
          {t`Failed to retrieve configuration.`}
          <ErrorDetail error={error} />
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
  const subscriptionMgmtRoute = useMatch({ path: '/subscription_management', end: false });
  return !!config.license_info?.valid_key && !subscriptionMgmtRoute;
};
