import type { Instance } from 'types/api';
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
  ToolbarItem,
} from '@patternfly/react-core';

import { MetricsAPI, InstancesAPI } from 'api';
import useRequest from 'hooks/useRequest';
import ContentEmpty from 'components/ContentEmpty';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import ContentError from 'components/ContentError';
import type { MetricSeries } from './LineChart';
import LineChart from './LineChart';

/** One sample of a metric, as the API's json rendering of prometheus gives it. */
interface PrometheusSample {
  /** Which instance the sample was taken on, among other labels. */
  labels: { node?: string; [key: string]: string | undefined };
  value: number;
}

/** One metric, with a sample per instance reporting it. */
interface PrometheusMetric {
  help?: string;
  samples: PrometheusSample[];
}

let count = [0];

function useInterval(
  callback: () => void,
  delay: number,
  instance: string | null,
  metric: string | null
) {
  const savedCallback = useRef<() => void>(undefined);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  useEffect(() => {
    function tick() {
      count.push(count.length);
      if (instance && metric) {
        savedCallback.current?.();
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
  const [instance, setInstance] = useState<string | null>(null);
  const [metric, setMetric] = useState<string | null>(null);
  const [metricIsOpen, setMetricIsOpen] = useState(false);
  const [renderedData, setRenderedData] = useState<MetricSeries[]>([]);
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
      const instanceNames: string[] = [];
      results.forEach((result: Instance) => {
        if (result.node_type !== 'execution') {
          instanceNames.push(result.hostname as string);
        }
      });

      return {
        instances:
          instanceNames.length > 1 ? [...instanceNames, t`All`] : instanceNames,
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
      const instanceData: PrometheusMetric[] = Object.values(data);
      instanceData.forEach((value: PrometheusMetric) => {
        value.samples.forEach((sample: PrometheusSample) => {
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
              } else {
                const series = rendered[renderedIndex] as MetricSeries;
                series.values = [
                  ...(series.values ?? []),
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
      return data[metric as string].help_text;

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
                <LineChart data={renderedData} helpText={helpText} />
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
