from unittest import mock

from django.conf import settings
from prometheus_client.parser import text_string_to_metric_families

from awx.main.analytics import subsystem_metrics


def fake_request():
    request = mock.Mock()
    request.query_params.getlist.return_value = []
    return request


def build_instance_data(metrics_obj, node_names):
    # shape matches what load_other_metrics returns after json-decoding valkey data
    data = {}
    for node in node_names:
        node_data = {}
        for field, metric in metrics_obj.METRICS.items():
            if isinstance(metric, subsystem_metrics.HistogramM):
                node_data[field] = {'counts': [0] * len(metric.buckets), 'sum': 0, 'inf': 0}
            else:
                node_data[field] = 0
        data[node] = node_data
    return data


def test_metrics_declare_each_metric_once(monkeypatch):
    # the prometheus exposition format allows at most one HELP/TYPE line per
    # metric; the operational metrics shared by all namespaces used to be
    # declared once per namespace (github.com/ctrliq/ascender issue #766)
    monkeypatch.setattr(
        subsystem_metrics.Metrics,
        'load_other_metrics',
        lambda self, request: build_instance_data(self, ['node1', 'node2']),
    )
    output = subsystem_metrics.metrics(fake_request())

    help_lines = [line for line in output.splitlines() if line.startswith('# HELP')]
    type_lines = [line for line in output.splitlines() if line.startswith('# TYPE')]
    assert len(help_lines) == len(set(help_lines)), 'duplicate HELP lines in metrics output'
    assert len(type_lines) == len(set(type_lines)), 'duplicate TYPE lines in metrics output'

    # output must parse as valid prometheus text format, with the shared
    # operational metrics keeping their per-namespace samples
    families = {family.name: family for family in text_string_to_metric_families(output)}
    for field in subsystem_metrics.Metrics.OPERATIONAL_FIELDS:
        subsystems = {sample.labels['subsystem'] for sample in families[field].samples}
        assert subsystems == {settings.METRICS_SERVICE_DISPATCHER, settings.METRICS_SERVICE_CALLBACK_RECEIVER}
        nodes = {sample.labels['node'] for sample in families[field].samples}
        assert nodes == {'node1', 'node2'}
