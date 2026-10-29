import React, { useCallback, useContext, useEffect, useMemo } from 'react';

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
import { setCustomTheme } from 'themeRegistry';
import { MAX_ROWS_STORAGE_KEY } from 'components/CodeEditor/constants';
import { applyAccountTheme } from '../accountTheme';
import { useSession } from './Session';

/**
 * What the config context carries. Assembled from several endpoints in the
 * provider below, which is why it is declared here rather than taken from a
 * single generated schema.
 */
/**
 * The current user, as /api/v2/me returns them. Only the fields the screens
 * read are named; the index signature carries the rest of the serializer.
 */
export interface CurrentUser {
  id?: number;
  username?: string;
  /** The id of the theme the account asks for; empty when none is recorded. */
  preferred_theme?: string;
  is_superuser?: boolean;
  is_system_auditor?: boolean;
  [key: string]: unknown;
}

export interface ConfigValue {
  /** The current user, as /api/v2/me returns them. */
  me?: CurrentUser;
  version?: string;
  toJSON?: () => string;
  isLoading?: boolean;
  request?: () => Promise<void> | void;
  /** Where manual projects live on disk, and the paths already taken. */
  project_base_dir?: string;
  project_local_paths?: string[];
  /** The system settings, whose shape is whatever the API returns. */
  systemConfig?: Record<string, unknown>;
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

export const ConfigProvider = ({ children }: { children: React.ReactNode }) => {
  const { logout } = useSession();

  const {
    error: configError,
    isLoading,
    request,
    result: config,
  } = useRequest<ConfigValue>(
    useCallback(async (): Promise<ConfigValue> => {
      const [{ data }, { data: meData }, { data: rootDataRaw }] =
        await Promise.all([ConfigAPI.read(), MeAPI.read(), RootAPI.read()]);
      const rootData = (rootDataRaw ?? {}) as Record<string, unknown>;
      const [me] = (meData as { results: Record<string, unknown>[] }).results;
      let systemConfig: Record<string, unknown> = {};
      if (me?.is_superuser || me?.is_system_auditor) {
        const { data: systemConfigResults } = await SettingsAPI.readSystem();
        systemConfig = systemConfigResults as Record<string, unknown>;
      }

      // The installation's UI defaults arrive with /api/v2/config/ rather than
      // /api/v2/settings/ui/, which answers only administrators and system
      // auditors. These defaults are for everyone else too, and above all for
      // the users who have not chosen a theme or a language of their own.
      const uiConfig = (data ?? {}) as Record<string, unknown>;

      // The themes that ship with the product are bundled at build time, so an
      // administrator's own stylesheet can only arrive here, once the settings
      // have loaded. Install it before applying the account's choice, which
      // may well be that stylesheet: App.tsx applied the browser's cached
      // theme on mount, before either was known.
      setCustomTheme(
        uiConfig.custom_theme as string,
        uiConfig.custom_theme_name as string
      );

      // The theme and the language are both decided before this request
      // answers: the theme on mount, the language on the first render.
      // Mirroring them lets the next load start in the right one, which is the
      // same thing localStorage already does for the account's own theme.
      const mirror = (key: string, value: unknown) => {
        if (value) localStorage.setItem(key, value as string);
        else localStorage.removeItem(key);
      };
      mirror('default_theme', uiConfig.default_ui_theme);
      mirror('default_language', uiConfig.default_ui_language);
      // Read at render by every editor on the page, which is why it is left
      // here rather than passed down: the screens that hold one have no other
      // reason to know about the config.
      mirror(MAX_ROWS_STORAGE_KEY, uiConfig.max_ui_editor_rows);

      applyAccountTheme(me, uiConfig.default_ui_theme as string);

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
        // No language on the account, so the installation's default decides.
        // It sits above the browser deliberately: an install set to one
        // language wants it for everyone who has not chosen, which is the only
        // case that reaches here. A language the account did choose is handled
        // above and is never overridden.
        localStorage.removeItem('preferred_language');
        const installDefault = uiConfig.default_ui_language as string;
        const browserLang = (navigator.language || '')
          .toLowerCase()
          .split(/[_-]+/)[0];
        const known = (lang?: string) =>
          Boolean(lang) && Object.keys(locales).includes(lang as string);
        let language = 'en';
        if (known(installDefault)) language = installDefault;
        else if (known(browserLang)) language = browserLang as string;
        await dynamicActivate(language);
      }
      return {
        ...(data as Record<string, unknown>),
        me,
        adminOrgCount,
        notifAdminCount,
        execEnvAdminCount,
        systemConfig,
        custom_logo: rootData.custom_logo,
        custom_header_logo: rootData.custom_header_logo,
        custom_title: rootData.custom_title,
      };
    }, []),
    {
      adminOrgCount: 0,
      notifAdminCount: 0,
      execEnvAdminCount: 0,
      systemConfig: {},
    }
  );

  const { error, dismissError } = useDismissableError(configError);

  useEffect(() => {
    request();
  }, [request]);

  useEffect(() => {
    if (
      (error as { response?: { status?: number } })?.response?.status === 401
    ) {
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

/** What the route config and the nav read off the current user. */
export interface UserProfile {
  isSuperUser: boolean;
  isSystemAuditor: boolean;
  /**
   * How many organizations the user administers, notification templates they
   * may manage, and execution environments they may edit. Each is a count
   * rather than a flag: a screen shows the control when it is above zero.
   */
  isOrgAdmin?: number;
  isNotificationAdmin?: number;
  isExecEnvAdmin?: number;
  systemConfig?: Record<string, unknown>;
}

export const useUserProfile = (): UserProfile => {
  const config = useConfig();
  return {
    isSuperUser: !!config.me?.is_superuser,
    isSystemAuditor: !!config.me?.is_system_auditor,
    isOrgAdmin: config.adminOrgCount as number | undefined,
    isNotificationAdmin: config.notifAdminCount as number | undefined,
    isExecEnvAdmin: config.execEnvAdminCount as number | undefined,
    systemConfig: config.systemConfig,
  };
};

export const useAuthorizedPath = () =>
  // Kept as a hook rather than removed so its callers read the same. It used to
  // answer false when the licence had no valid key, which sent the whole app to
  // the subscription wizard. There is no subscription and no wizard, and the
  // open licence is always valid, so there is nothing left for it to refuse.
  true;
