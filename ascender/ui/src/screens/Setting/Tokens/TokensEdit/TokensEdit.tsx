import type { OptionsField } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { FormRoot } from 'components/Form';
import { Form } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { FormSubmitError } from 'components/FormField';
import { FormColumnLayout } from 'components/FormLayout';
import { useSettings } from 'contexts/Settings';
import useModal from 'hooks/useModal';
import useRequest from 'hooks/useRequest';
import { SettingsAPI } from 'api';
import { BooleanField, InputField } from '../../shared/SharedFields';
import { RevertAllAlert, RevertFormActionGroup } from '../../shared';
import { factoryDefaults } from '../../shared/settingUtils';

/**
 * How long an OAuth 2 token lasts, and who may ask for one.
 *
 * Its own form rather than the shared one: the three expirations are fields
 * of a single nested setting the api takes whole, so the form takes them
 * apart on the way in and puts them back on the way out.
 */
function TokensEdit() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const detailUrl = '/authentication/tokens/details';
  const { isModalOpen, toggleModal, closeModal } = useModal();
  const { PUT: options = {} } = useSettings();

  const {
    isLoading,
    error,
    request: fetchTokens,
    result: tokens,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('authentication');
      const timeouts = (data.OAUTH2_PROVIDER ?? {}) as Record<string, unknown>;
      const oauthOptions = options.OAUTH2_PROVIDER;
      // One nested setting holding three numbers, shown as three fields of the
      // type its child declares, each defaulting to its own key's default.
      const expiration = (key: string, label: string): OptionsField => ({
        ...oauthOptions,
        default: ((oauthOptions?.default ?? {}) as Record<string, number>)?.[
          key
        ],
        type: (oauthOptions?.child as { type?: string })?.type,
        label,
        value: timeouts[key],
      });

      return {
        ACCESS_TOKEN_EXPIRE_SECONDS: expiration(
          'ACCESS_TOKEN_EXPIRE_SECONDS',
          t`Access Token Expiration`
        ),
        REFRESH_TOKEN_EXPIRE_SECONDS: expiration(
          'REFRESH_TOKEN_EXPIRE_SECONDS',
          t`Refresh Token Expiration`
        ),
        AUTHORIZATION_CODE_EXPIRE_SECONDS: expiration(
          'AUTHORIZATION_CODE_EXPIRE_SECONDS',
          t`Authorization Code Expiration`
        ),
        ALLOW_OAUTH2_FOR_EXTERNAL_USERS: {
          ...options.ALLOW_OAUTH2_FOR_EXTERNAL_USERS,
          value: data.ALLOW_OAUTH2_FOR_EXTERNAL_USERS,
        } as OptionsField,
      };
    }, [options, t]),
    null
  );

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const { error: submitError, request: submitForm } = useRequest(
    useCallback(
      async (values: Record<string, unknown>) => {
        await SettingsAPI.updateAll(values);
        navigate(detailUrl);
      },
      [navigate]
    ),
    null
  );

  const { error: revertError, request: revertAll } = useRequest(
    useCallback(async () => {
      // The two settings this page shows, rather than a DELETE on the whole
      // authentication category, which would also reset the Session, Password
      // and Mapping tabs and switch local authentication back on.
      await SettingsAPI.updateAll(
        factoryDefaults(
          ['OAUTH2_PROVIDER', 'ALLOW_OAUTH2_FOR_EXTERNAL_USERS'],
          options
        )
      );
    }, [options]),
    null
  );

  const handleSubmit = async (form: Record<string, unknown>) => {
    const {
      ACCESS_TOKEN_EXPIRE_SECONDS,
      REFRESH_TOKEN_EXPIRE_SECONDS,
      AUTHORIZATION_CODE_EXPIRE_SECONDS,
      ALLOW_OAUTH2_FOR_EXTERNAL_USERS,
    } = form;

    await submitForm({
      ALLOW_OAUTH2_FOR_EXTERNAL_USERS,
      OAUTH2_PROVIDER: {
        ACCESS_TOKEN_EXPIRE_SECONDS,
        REFRESH_TOKEN_EXPIRE_SECONDS,
        AUTHORIZATION_CODE_EXPIRE_SECONDS,
      },
    });
  };

  const handleRevertAll = async () => {
    await revertAll();
    closeModal();
    navigate(detailUrl);
  };

  return (
    <CardBody>
      {Boolean(isLoading) && <ContentLoading />}
      {!isLoading && Boolean(error) && <ContentError error={error} />}
      {!isLoading && tokens && (
        <FormRoot
          initialValues={{
            ACCESS_TOKEN_EXPIRE_SECONDS:
              tokens.ACCESS_TOKEN_EXPIRE_SECONDS?.value ?? '',
            REFRESH_TOKEN_EXPIRE_SECONDS:
              tokens.REFRESH_TOKEN_EXPIRE_SECONDS?.value ?? '',
            AUTHORIZATION_CODE_EXPIRE_SECONDS:
              tokens.AUTHORIZATION_CODE_EXPIRE_SECONDS?.value ?? '',
            // A switch, so an unset value is off rather than empty text,
            // which a save would otherwise send back as ''.
            ALLOW_OAUTH2_FOR_EXTERNAL_USERS:
              tokens.ALLOW_OAUTH2_FOR_EXTERNAL_USERS?.value ?? false,
          }}
          onSubmit={handleSubmit}
        >
          {(formik) => (
            <Form autoComplete="off" onSubmit={formik.handleSubmit}>
              <FormColumnLayout>
                <InputField
                  name="ACCESS_TOKEN_EXPIRE_SECONDS"
                  config={tokens.ACCESS_TOKEN_EXPIRE_SECONDS}
                  type="number"
                />
                <InputField
                  name="REFRESH_TOKEN_EXPIRE_SECONDS"
                  config={tokens.REFRESH_TOKEN_EXPIRE_SECONDS}
                  type="number"
                />
                <InputField
                  name="AUTHORIZATION_CODE_EXPIRE_SECONDS"
                  config={tokens.AUTHORIZATION_CODE_EXPIRE_SECONDS}
                  type="number"
                />
                <BooleanField
                  name="ALLOW_OAUTH2_FOR_EXTERNAL_USERS"
                  config={tokens.ALLOW_OAUTH2_FOR_EXTERNAL_USERS}
                />
                {Boolean(submitError) && (
                  <FormSubmitError error={submitError} />
                )}
                {Boolean(revertError) && (
                  <FormSubmitError error={revertError} />
                )}
              </FormColumnLayout>
              <RevertFormActionGroup
                onCancel={() => navigate(detailUrl)}
                onSubmit={formik.handleSubmit}
                onRevert={toggleModal}
              />
              {isModalOpen && (
                <RevertAllAlert
                  onClose={closeModal}
                  onRevertAll={handleRevertAll}
                />
              )}
            </Form>
          )}
        </FormRoot>
      )}
    </CardBody>
  );
}

export default TokensEdit;
