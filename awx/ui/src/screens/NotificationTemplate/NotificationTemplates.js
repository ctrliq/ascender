import React, { useState, useCallback } from 'react';
import { Route, Switch, useRouteMatch } from 'react-router-dom';

import { i18n } from '@lingui/core';
import { msg } from '@lingui/macro';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import NotificationTemplateList from './NotificationTemplateList';
import NotificationTemplateAdd from './NotificationTemplateAdd';
import NotificationTemplate from './NotificationTemplate';

function NotificationTemplates() {
  const match = useRouteMatch();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/notification_templates': i18n._(msg`Notification Templates`),
    '/notification_templates/add': i18n._(
      msg`Create New Notification Template`
    ),
  });

  const updateBreadcrumbConfig = useCallback((notification) => {
    const { id } = notification;
    setBreadcrumbConfig({
      '/notification_templates': i18n._(msg`Notification Templates`),
      '/notification_templates/add': i18n._(
        msg`Create New Notification Template`
      ),
      [`/notification_templates/${id}`]: notification.name,
      [`/notification_templates/${id}/edit`]: i18n._(msg`Edit Details`),
      [`/notification_templates/${id}/details`]: i18n._(msg`Details`),
    });
  }, []);

  return (
    <>
      <ScreenHeader
        streamType="notification_template"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Switch>
        <Route path={`${match.url}/add`}>
          <NotificationTemplateAdd />
        </Route>
        <Route path={`${match.url}/:id`}>
          <NotificationTemplate setBreadcrumb={updateBreadcrumbConfig} />
        </Route>
        <Route path={`${match.url}`}>
          <PersistentFilters pageKey="notificationTemplates">
            <NotificationTemplateList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export default NotificationTemplates;
