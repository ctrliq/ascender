import React, { useCallback, useEffect } from 'react';
import { Navigate } from 'react-router';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import ScreenHeader from 'components/ScreenHeader';
import { SettingsProvider, useSettings } from 'contexts/Settings';
import { useConfig } from 'contexts/Config';
import { SettingsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import '../Settings.css';

export interface SettingsPageProps {
  /**
   * The trail this page shows, its own root first: a settings page is named in
   * the rail and reached directly, so the trail it carries is its own rather
   * than a slice of one map covering every settings page there is.
   */
  breadcrumbConfig: Record<string, string | null>;
  children: React.ReactNode;
}

/**
 * What every settings page needs before it can show anything: the options the
 * API describes its settings with, the permission to see them at all, and the
 * header naming where the reader is.
 *
 * The pages are ordinary screens, each mounted at its own address; this is the
 * part they share, said once here rather than in a screen that stood in front
 * of them all and worked out which one the address meant.
 */
function SettingsPage({ breadcrumbConfig, children }: SettingsPageProps) {
  const { me } = useConfig();
  // A page mounted inside a settings context has been given the options
  // already, and reads them from there rather than asking again.
  const given = useSettings();
  const hasOptions = Object.keys(given).length > 0;

  const { request, result, isLoading, error } = useRequest(
    useCallback(async () => {
      const response = await SettingsAPI.readAllOptions();
      return response.data.actions;
    }, [])
  );

  useEffect(() => {
    if (!hasOptions) {
      request();
    }
  }, [hasOptions, request]);

  if (hasOptions) {
    return (
      <SettingsFrame breadcrumbConfig={breadcrumbConfig}>
        {children}
      </SettingsFrame>
    );
  }

  if (error) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={error} />
        </Card>
      </PageSection>
    );
  }

  if (isLoading || !result || !me) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentLoading />
      </PageSection>
    );
  }

  // Who may look at all: a settings page is for an administrator or an
  // auditor, which is asked here because this is where the page is reached
  // from the rail. A page handed its options by a context above has been
  // mounted by a test, which says for itself who it is mounting as.
  if (!me?.is_superuser && !me?.is_system_auditor) {
    return <Navigate to="/" replace />;
  }

  return (
    <SettingsProvider value={result}>
      <SettingsFrame breadcrumbConfig={breadcrumbConfig}>
        {children}
      </SettingsFrame>
    </SettingsProvider>
  );
}

/** The header and the wrapper every settings page is shown in. */
function SettingsFrame({ breadcrumbConfig, children }: SettingsPageProps) {
  return (
    // The class is the hook the settings stylesheet hangs on, so what it says
    // reaches these pages and no others.
    <div className="ascender-settings">
      <ScreenHeader streamType="setting" breadcrumbConfig={breadcrumbConfig} />
      {children}
    </div>
  );
}

export default SettingsPage;
