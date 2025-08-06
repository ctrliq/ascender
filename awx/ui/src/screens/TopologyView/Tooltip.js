import React, { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { t, Plural } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import styled from 'styled-components';
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
  TextContent,
  Text as PFText,
  TextVariants,
  Label,
} from '@patternfly/react-core';
import { DownloadIcon } from '@patternfly/react-icons';
import ContentLoading from 'components/ContentLoading';
import InstanceToggle from 'components/InstanceToggle';
import StatusLabel from 'components/StatusLabel';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { formatDateString } from 'util/dates';

const Wrapper = styled.div`
  position: absolute;
  right: 0;
  padding: 0 10px;
  width: 25%;
  background-color: rgba(255, 255, 255, 0.85);
  overflow: auto;
  height: 100%;
`;
const Button = styled(PFButton)`
  &&& {
    width: 30px;
    height: 30px;
    border-radius: 15px;
    padding: 0;
    font-size: 16px;
    background-color: white;
    border: 1px solid #ccc;
    color: black;
  }
`;
const DescriptionList = styled(PFDescriptionList)`
  gap: 0;
`;
const DescriptionListGroup = styled(PFDescriptionListGroup)`
  align-items: center;
  margin-top: 10px;
`;
const Text = styled(PFText)`
  margin: 10px 0 5px;
`;

const Unavailable = styled.span`
  color: var(--pf-global--danger-color--200);
`;

const SliderHolder = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SliderForks = styled.div`
  flex-grow: 1;
  margin-right: 8px;
  margin-left: 8px;
  text-align: center;
`;

const buildLinkURL = (inst) =>
  inst.is_container_group
    ? '/instance_groups/container_group/'
    : '/instance_groups/';

function renderInstanceGroups(instanceGroups) {
  return instanceGroups.map((ig) => (
    <React.Fragment key={ig.id}>
      <Label
        color="blue"
        isTruncated
        render={({ className, content, componentRef }) => (
          <Link
            to={`${buildLinkURL(ig)}${ig.id}/details`}
            className={className}
            innerRef={componentRef}
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

function usedCapacity(instance, i18n) {
  if (instance.enabled) {
    return (
      <Progress
        value={Math.round(100 - instance.percent_capacity_remaining)}
        measureLocation={ProgressMeasureLocation.top}
        size={ProgressSize.sm}
        title={i18n._(t`Used capacity`)}
      />
    );
  }
  return <Unavailable>{i18n._(t`Unavailable`)}</Unavailable>;
}

function Tooltip({
  fetchInstance,
  isNodeSelected,
  renderNodeIcon,
  instanceDetail,
  instanceGroups,
  isLoading,
  redirectToDetailsPage,
}) {
  const { me = {} } = useConfig();
  const { i18n } = useLingui();

  const [forks, setForks] = useState(
    computeForks(
      instanceDetail.mem_capacity,
      instanceDetail.cpu_capacity,
      instanceDetail.capacity_adjustment
    )
  );

  const { error: updateInstanceError, request: updateInstance } = useRequest(
    useCallback(
      async (values) => {
        await InstancesAPI.update(instanceDetail.id, values);
      },
      [instanceDetail]
    )
  );

  const debounceUpdateInstance = useDebounce(updateInstance, 100);

  const { error: updateError, dismissError: dismissUpdateError } =
    useDismissableError(updateInstanceError);

  const handleChangeValue = (value) => {
    const roundedValue = Math.round(value * 100) / 100;
    setForks(
      computeForks(
        instanceDetail.mem_capacity,
        instanceDetail.cpu_capacity,
        roundedValue
      )
    );
    debounceUpdateInstance({ capacity_adjustment: roundedValue });
  };

  useEffect(() => {
    setForks(
      computeForks(
        instanceDetail.mem_capacity,
        instanceDetail.cpu_capacity,
        instanceDetail.capacity_adjustment
      )
    );
  }, [instanceDetail]);
  return (
    <Wrapper className="tooltip" data-cy="tooltip">
      {isNodeSelected === false ? (
        <TextContent>
          <Text
            component={TextVariants.small}
            style={{ fontWeight: 'bold', color: 'black', marginTop: 0 }}
          >
            {i18n._(t`Details`)}
          </Text>
          <Divider component="div" />
          <Text component={TextVariants.small}>
            {i18n._(t`Click on a node icon to display the details.`)}
          </Text>
        </TextContent>
      ) : (
        <>
          {updateError && (
            <AlertModal
              variant="error"
              title={i18n._(t`Error!`)}
              isOpen
              onClose={dismissUpdateError}
              dataCy="update-instance-alert"
            >
              {i18n._(t`Failed to update instance.`)}
              <ErrorDetail error={updateError} />
            </AlertModal>
          )}
          <TextContent>
            <Text
              component={TextVariants.small}
              style={{ fontWeight: 'bold', color: 'black' }}
            >
              {i18n._(t`Details`)}
            </Text>
            <Divider component="div" />
          </TextContent>
          {isLoading && <ContentLoading />}
          {!isLoading && (
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListDescription>
                  <Button>{renderNodeIcon}</Button>{' '}
                  <PFButton
                    variant="link"
                    isInline
                    onClick={redirectToDetailsPage}
                    dataCy="redirect-to-details-button"
                  >
                    {instanceDetail.hostname}
                  </PFButton>
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>
                  {i18n._(t`Instance status`)}
                </DescriptionListTerm>
                <DescriptionListDescription dataCy="node-state">
                  <StatusLabel status={instanceDetail.node_state} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>
                  {i18n._(t`Instance type`)}
                </DescriptionListTerm>
                <DescriptionListDescription dataCy="node-type">
                  {instanceDetail.node_type}
                </DescriptionListDescription>
              </DescriptionListGroup>
              {instanceDetail.related?.install_bundle && (
                <DescriptionListGroup>
                  <DescriptionListTerm>
                    {i18n._(t`Download bundle`)}
                  </DescriptionListTerm>
                  <DescriptionListDescription>
                    <PFButton
                      dataCy="install-bundle-download-button"
                      aria-label={i18n._(t`Download Bundle`)}
                      component="a"
                      isSmall
                      href={`${instanceDetail.related?.install_bundle}`}
                      target="_blank"
                      variant="secondary"
                      rel="noopener noreferrer"
                    >
                      <DownloadIcon />
                    </PFButton>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}
              {instanceDetail.ip_address && (
                <DescriptionListGroup>
                  <DescriptionListTerm>
                    {i18n._(t`IP address`)}
                  </DescriptionListTerm>
                  <DescriptionListDescription>
                    {instanceDetail.ip_address}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}
              {instanceGroups && (
                <DescriptionListGroup>
                  <DescriptionListTerm>
                    {i18n._(t`Instance groups`)}
                  </DescriptionListTerm>
                  <DescriptionListDescription dataCy="instance-groups">
                    {renderInstanceGroups(instanceGroups.results)}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}
              {instanceDetail.node_type !== 'hop' && (
                <>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {i18n._(t`Forks`)}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      <SliderHolder data-cy="slider-holder">
                        <div data-cy="cpu-capacity">
                          {i18n._(t`CPU ${instanceDetail.cpu_capacity}`)}
                        </div>
                        <SliderForks data-cy="slider-forks">
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
                            value={instanceDetail.capacity_adjustment}
                            onChange={handleChangeValue}
                            isDisabled={
                              !me?.is_superuser || !instanceDetail.enabled
                            }
                            data-cy="slider"
                          />
                        </SliderForks>
                        <div data-cy="mem-capacity">
                          {i18n._(t`RAM ${instanceDetail.mem_capacity}`)}
                        </div>
                      </SliderHolder>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {i18n._(t`Capacity`)}
                    </DescriptionListTerm>
                    <DescriptionListDescription dataCy="used-capacity">
                      {usedCapacity(instanceDetail, i18n)}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListDescription>
                      <InstanceToggle
                        css="display: inline-flex;"
                        fetchInstances={fetchInstance}
                        instance={instanceDetail}
                        dataCy="enable-instance"
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </>
              )}

              <DescriptionListGroup>
                <DescriptionListTerm>
                  {i18n._(t`Last modified`)}
                </DescriptionListTerm>
                <DescriptionListDescription dataCy="last-modified">
                  {formatDateString(instanceDetail.modified)}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>
                  {i18n._(t`Last seen`)}
                </DescriptionListTerm>
                <DescriptionListDescription dataCy="last-seen">
                  {instanceDetail.last_seen
                    ? formatDateString(instanceDetail.last_seen)
                    : `not found`}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          )}
        </>
      )}
    </Wrapper>
  );
}

export default Tooltip;
