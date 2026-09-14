import type { Instance, InstanceGroup, Paginated } from 'types/api';
import type { Translate } from 'types/lingui';
import React, { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router';
import { Plural, useLingui } from '@lingui/react/macro';
import { useConfig } from 'contexts/Config';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import useDebounce from 'hooks/useDebounce';
import { InstancesAPI } from 'api';
import computeForks from 'util/computeForks';
import {
  Button as PFButton,
  DescriptionList as PFDescriptionList,
  DescriptionListTerm,
  DescriptionListGroup as PFDescriptionListGroup,
  DescriptionListDescription,
  Divider,
  Progress,
  ProgressMeasureLocation,
  ProgressSize,
  Slider,
  Content,
  ContentVariants,
  Label,
} from '@patternfly/react-core';
import { DownloadIcon } from '@patternfly/react-icons';
import ContentLoading from 'components/ContentLoading';
import InstanceToggle from 'components/InstanceToggle';
import StatusLabel from 'components/StatusLabel';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { formatDateString } from 'util/dates';
import './Tooltip.css';

const buildLinkURL = (inst: InstanceGroup) =>
  inst.is_container_group
    ? '/instance_groups/container_group/'
    : '/instance_groups/';

function renderInstanceGroups(instanceGroups: InstanceGroup[]) {
  return instanceGroups.map((ig: InstanceGroup) => (
    <React.Fragment key={ig.id}>
      <Label
        color="blue"

        render={({ className, content, componentRef }) => (
          <Link
            to={`${buildLinkURL(ig)}${ig.id}/details`}
            className={className}
            ref={componentRef}
          >
            {content}
          </Link>
        )}
      >
        {ig.name}
      </Label>{' '}
    </React.Fragment>
  ));
}

function usedCapacity(instance: Partial<Instance>, t: Translate) {
  if (instance.enabled) {
    return (
      <Progress
        value={Math.round(100 - Number(instance.percent_capacity_remaining))}
        measureLocation={ProgressMeasureLocation.top}
        size={ProgressSize.sm}
        title={t`Used capacity`}
      />
    );
  }
  return <span className="ascender-tooltip__unavailable">{t`Unavailable`}</span>;
}

export interface TooltipProps {
  fetchInstance: () => void;
  isNodeSelected: boolean;
  renderNodeIcon: React.ReactNode;
  /** The selected instance, empty until its detail request lands. */
  instanceDetail: Partial<Instance>;
  instanceGroups?: Paginated<InstanceGroup> | null;
  isLoading: boolean;
  redirectToDetailsPage: () => void;
  [key: string]: unknown;
}

function Tooltip({
  fetchInstance,
  isNodeSelected,
  renderNodeIcon,
  instanceDetail,
  instanceGroups,
  isLoading,
  redirectToDetailsPage,
}: TooltipProps) {
  const { me = {} } = useConfig();
  const { t } = useLingui();

  const [forks, setForks] = useState(
    computeForks(
      instanceDetail.mem_capacity ?? 0,
      instanceDetail.cpu_capacity ?? 0,
      Number(instanceDetail.capacity_adjustment)
    )
  );

  const { error: updateInstanceError, request: updateInstance } = useRequest(
    useCallback(
      async (values: { capacity_adjustment: number }) => {
        await InstancesAPI.update(instanceDetail.id as number, values);
      },
      [instanceDetail]
    )
  );

  const debounceUpdateInstance = useDebounce(updateInstance, 100);

  const { error: updateError, dismissError: dismissUpdateError } =
    useDismissableError(updateInstanceError);

  const handleChangeValue = (value: number) => {
    const roundedValue = Math.round(value * 100) / 100;
    setForks(
      computeForks(
        instanceDetail.mem_capacity ?? 0,
        instanceDetail.cpu_capacity ?? 0,
        roundedValue
      )
    );
    debounceUpdateInstance({ capacity_adjustment: roundedValue });
  };

  useEffect(() => {
    setForks(
      computeForks(
        instanceDetail.mem_capacity ?? 0,
        instanceDetail.cpu_capacity ?? 0,
        Number(instanceDetail.capacity_adjustment)
      )
    );
  }, [instanceDetail]);
  return (
    <div className="ascender-tooltip__wrapper tooltip" data-cy="tooltip">
      {isNodeSelected === false ? (
        <Content>
          <Content
            className="ascender-tooltip__text"
            component={ContentVariants.small}
            style={{
              fontWeight: 'bold',
              color: 'var(--pf-t--global--text--color--100)',
              marginTop: 0,
            }}
          >
            {t`Details`}
          </Content>
          <Divider component="div" />
          <Content
            className="ascender-tooltip__text"
            component={ContentVariants.small}
          >
            {t`Click on a node icon to display the details.`}
          </Content>
        </Content>
      ) : (
        <>
          {updateError && (
            <AlertModal
              variant="error"
              title={t`Error!`}
              isOpen
              onClose={dismissUpdateError}
              dataCy="update-instance-alert"
            >
              {t`Failed to update instance.`}
              <ErrorDetail error={updateError} />
            </AlertModal>
          )}
          <Content>
            <Content
              className="ascender-tooltip__text"
              component={ContentVariants.small}
              style={{
                fontWeight: 'bold',
                color: 'var(--pf-t--global--text--color--100)',
              }}
            >
              {t`Details`}
            </Content>
            <Divider component="div" />
          </Content>
          {isLoading && <ContentLoading />}
          {!isLoading && (
            <PFDescriptionList className="ascender-tooltip__description-list">
              <PFDescriptionListGroup className="ascender-tooltip__description-list-group">
                <DescriptionListDescription>
                  <PFButton className="ascender-tooltip__button">
                    {renderNodeIcon}
                  </PFButton>{' '}
                  <PFButton
                    variant="link"
                    isInline
                    onClick={redirectToDetailsPage}
                    data-cy="redirect-to-details-button"
                  >
                    {instanceDetail.hostname}
                  </PFButton>
                </DescriptionListDescription>
              </PFDescriptionListGroup>
              <PFDescriptionListGroup className="ascender-tooltip__description-list-group">
                <DescriptionListTerm>{t`Instance status`}</DescriptionListTerm>
                <DescriptionListDescription data-cy="node-state">
                  <StatusLabel
                    status={instanceDetail.node_state ?? undefined}
                  />
                </DescriptionListDescription>
              </PFDescriptionListGroup>
              <PFDescriptionListGroup className="ascender-tooltip__description-list-group">
                <DescriptionListTerm>{t`Instance type`}</DescriptionListTerm>
                <DescriptionListDescription data-cy="node-type">
                  {instanceDetail.node_type}
                </DescriptionListDescription>
              </PFDescriptionListGroup>
              {instanceDetail.related?.install_bundle && (
                <PFDescriptionListGroup className="ascender-tooltip__description-list-group">
                  <DescriptionListTerm>
                    {t`Download bundle`}
                  </DescriptionListTerm>
                  <DescriptionListDescription>
                    <PFButton
                      icon={<DownloadIcon />}
                      data-cy="install-bundle-download-button"
                      aria-label={t`Download Bundle`}
                      component="a"
                      size="sm"
                      href={`${instanceDetail.related?.install_bundle}`}
                      target="_blank"
                      variant="secondary"
                      rel="noopener noreferrer"
                    />
                  </DescriptionListDescription>
                </PFDescriptionListGroup>
              )}
              {instanceDetail.ip_address && (
                <PFDescriptionListGroup className="ascender-tooltip__description-list-group">
                  <DescriptionListTerm>{t`IP address`}</DescriptionListTerm>
                  <DescriptionListDescription>
                    {instanceDetail.ip_address}
                  </DescriptionListDescription>
                </PFDescriptionListGroup>
              )}
              {instanceGroups && (
                <PFDescriptionListGroup className="ascender-tooltip__description-list-group">
                  <DescriptionListTerm>
                    {t`Instance groups`}
                  </DescriptionListTerm>
                  <DescriptionListDescription data-cy="instance-groups">
                    {renderInstanceGroups(instanceGroups.results)}
                  </DescriptionListDescription>
                </PFDescriptionListGroup>
              )}
              {instanceDetail.node_type !== 'hop' && (
                <>
                  <PFDescriptionListGroup className="ascender-tooltip__description-list-group">
                    <DescriptionListTerm>{t`Forks`}</DescriptionListTerm>
                    <DescriptionListDescription>
                      <div
                        className="ascender-tooltip__slider-holder"
                        data-cy="slider-holder"
                      >
                        <div data-cy="cpu-capacity">
                          {t`CPU ${instanceDetail.cpu_capacity}`}
                        </div>
                        <div
                          className="ascender-tooltip__slider-forks"
                          data-cy="slider-forks"
                        >
                          <div data-cy="number-forks">
                            <Plural
                              value={forks}
                              one="# fork"
                              other="# forks"
                            />
                          </div>
                          <Slider
                            areCustomStepsContinuous
                            max={1}
                            min={0}
                            step={0.1}
                            value={Number(instanceDetail.capacity_adjustment)}
                            onChange={(_event, value) =>
                              handleChangeValue(value)
                            }
                            isDisabled={
                              !me?.is_superuser || !instanceDetail.enabled
                            }
                            data-cy="slider"
                          />
                        </div>
                        <div data-cy="mem-capacity">
                          {t`RAM ${instanceDetail.mem_capacity}`}
                        </div>
                      </div>
                    </DescriptionListDescription>
                  </PFDescriptionListGroup>
                  <PFDescriptionListGroup className="ascender-tooltip__description-list-group">
                    <DescriptionListTerm>{t`Capacity`}</DescriptionListTerm>
                    <DescriptionListDescription data-cy="used-capacity">
                      {usedCapacity(instanceDetail, t)}
                    </DescriptionListDescription>
                  </PFDescriptionListGroup>
                  <PFDescriptionListGroup className="ascender-tooltip__description-list-group">
                    <DescriptionListDescription>
                      <InstanceToggle
                        fetchInstances={fetchInstance}
                        // Only rendered once the detail request has landed.
                        instance={instanceDetail as Instance}
                        dataCy="enable-instance"
                      />
                    </DescriptionListDescription>
                  </PFDescriptionListGroup>
                </>
              )}

              <PFDescriptionListGroup className="ascender-tooltip__description-list-group">
                <DescriptionListTerm>{t`Last modified`}</DescriptionListTerm>
                <DescriptionListDescription data-cy="last-modified">
                  {formatDateString(instanceDetail.modified)}
                </DescriptionListDescription>
              </PFDescriptionListGroup>
              <PFDescriptionListGroup className="ascender-tooltip__description-list-group">
                <DescriptionListTerm>{t`Last seen`}</DescriptionListTerm>
                <DescriptionListDescription data-cy="last-seen">
                  {instanceDetail.last_seen
                    ? formatDateString(instanceDetail.last_seen)
                    : `not found`}
                </DescriptionListDescription>
              </PFDescriptionListGroup>
            </PFDescriptionList>
          )}
        </>
      )}
    </div>
  );
}

export default Tooltip;
