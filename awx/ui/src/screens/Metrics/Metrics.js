import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
	PageSection,
	Card,
	CardHeader,
	CardBody,
	MenuToggle,
	Select,
	SelectList,
	SelectOption,
	Toolbar,
	ToolbarGroup,
	ToolbarContent,
	ToolbarItem
} from '@patternfly/react-core';

import { MetricsAPI, InstancesAPI } from 'api';
import useRequest from 'hooks/useRequest';
import ContentEmpty from 'components/ContentEmpty';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import ContentError from 'components/ContentError';
import LineChart from './LineChart';

let count = [0];

function useInterval(callback, delay, instance, metric) {
  const savedCallback = useRef();
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  useEffect(() => {
    function tick() {
      count.push(count.length);
      if (instance && metric) {
        savedCallback.current();
      }
    }

    const id = setInterval(tick, delay);
    return () => {
      clearInterval(id);
    };
  }, [callback, delay, instance, metric]);
  return { count };
}
function Metrics() {
  const { t } = useLingui();
  const [instanceIsOpen, setInstanceIsOpen] = useState(false);
  const [instance, setInstance] = useState(null);
  const [metric, setMetric] = useState(null);
  const [metricIsOpen, setMetricIsOpen] = useState(false);
  const [renderedData, setRenderedData] = useState([]);
  const {
    result: { instances, metrics },
    error: fetchInitialError,
    request: fetchInstances,
  } = useRequest(
    useCallback(async () => {
      const [
        {
          data: { results },
        },
        { data: mets },
      ] = await Promise.all([
        InstancesAPI.read(),
        MetricsAPI.read({
          subsystemonly: 1,
          format: 'json',
        }),
      ]);

      const metricOptions = Object.keys(mets);
      const instanceNames = [];
      results.forEach((result) => {
        if (result.node_type !== 'execution') {
          instanceNames.push(result.hostname);
        }
      });

      return {
        instances:
          instanceNames.length > 1
            ? [...instanceNames, t`All`]
            : instanceNames,
        metrics: metricOptions,
      };
    }, [t]),
    { instances: [], metrics: [] }
  );

  const {
    result: helpText,
    error: updateError,
    request: fetchData,
  } = useRequest(
    useCallback(async () => {
      const { data } = await MetricsAPI.read({
        subsystemonly: 1,
        format: 'json',
        node: instance === 'All' ? null : instance,
        metric,
      });

      const rendered = renderedData;
      const instanceData = Object.values(data);
      instanceData.forEach((value) => {
        value.samples.forEach((sample) => {
          instances.forEach((i) => {
            if (i === sample.labels.node) {
              const renderedIndex = renderedData.findIndex(
                (rd) => rd.name === i
              );

              if (renderedIndex === -1) {
                rendered.push({
                  name: i,
                  values: [
                    {
                      y: sample.value,
                      x: count.length - 1,
                    },
                  ],
                });
              } else if (
                rendered[renderedIndex].values?.length === 0 ||
                !rendered[renderedIndex].values
              ) {
                rendered[renderedIndex].values = [
                  { y: sample.value, x: count.length - 1 },
                ];
              } else {
                rendered[renderedIndex].values = [
                  ...rendered[renderedIndex].values,
                  { y: sample.value, x: count.length - 1 },
                ];
              }
            }
          });
        });
      });
      let countRestrictedData = rendered;
      if (count.length > 49) {
        countRestrictedData = rendered.map(({ values, name }) => ({
          name,
          values: values.slice(-50),
        }));
      }

      setRenderedData(countRestrictedData);
      return data[metric].help_text;

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instance, metric, instances]),
    ''
  );

  useInterval(fetchData, 3000, instance, metric);

  useEffect(() => {
    if (instance && metric) {
      fetchData();
    }
  }, [fetchData, instance, metric]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);
  if (fetchInitialError || updateError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <CardBody>
            <ContentError error={fetchInitialError || updateError} />;
          </CardBody>
        </Card>
      </PageSection>
    );
  }
  return (
    <>
      <ScreenHeader breadcrumbConfig={{ '/metrics': t`Metrics` }} />

      <PageSection hasBodyWrapper={false}>
        <Card>
          <CardHeader>
            <Toolbar ouiaId="metrics-toolbar">
              <ToolbarContent>
                <ToolbarGroup>
                  <ToolbarItem>{t`Instance`}</ToolbarItem>
                  <ToolbarItem>
                    <Select
                      isOpen={instanceIsOpen}
                      onOpenChange={setInstanceIsOpen}
                      onSelect={(_event, value) => {
                        count = [0];
                        setInstance(value);
                        setInstanceIsOpen(false);
                        setRenderedData([]);
                      }}
                      data-ouia-component-id="Instance-select"
                      toggle={(toggleRef) => (
                        <MenuToggle
                          ref={toggleRef}
                          onClick={() => setInstanceIsOpen(!instanceIsOpen)}
                          isExpanded={instanceIsOpen}
                        >
                          {instance || t`Select an instance`}
                        </MenuToggle>
                      )}
                    >
                      <SelectList>
                        {instances.map((inst) => (
                          <SelectOption value={inst} key={inst}>
                            {inst}
                          </SelectOption>
                        ))}
                      </SelectList>
                    </Select>
                  </ToolbarItem>
                  <ToolbarItem>{t`Metric`}</ToolbarItem>
                  <ToolbarItem>
                    <Select
                      isOpen={metricIsOpen}
                      onOpenChange={setMetricIsOpen}
                      onSelect={(_event, value) => {
                        count = [0];
                        setMetric(value);
                        setRenderedData([]);
                        setMetricIsOpen(false);
                      }}
                      data-ouia-component-id="Metric-select"
                      toggle={(toggleRef) => (
                        <MenuToggle
                          ref={toggleRef}
                          onClick={() => setMetricIsOpen(!metricIsOpen)}
                          isExpanded={metricIsOpen}
                        >
                          {metric || t`Select a metric`}
                        </MenuToggle>
                      )}
                    >
                      <SelectList>
                        {metrics.map((met) => (
                          <SelectOption value={met} key={met}>
                            {met}
                          </SelectOption>
                        ))}
                      </SelectList>
                    </Select>
                  </ToolbarItem>
                </ToolbarGroup>
              </ToolbarContent>
            </Toolbar>
          </CardHeader>
          <CardBody>
            {instance && metric ? (
              Object.keys(renderedData).length > 0 && (
                <LineChart
                  data={renderedData}
                  count={count}
                  helpText={helpText}
                />
              )
            ) : (
              <ContentEmpty
                title={t`Select an instance and a metric to show chart`}
              />
            )}
          </CardBody>
        </Card>
      </PageSection>
    </>
  );
}

export default Metrics;
