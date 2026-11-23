---
title: Metrics
description: Scrape the Ascender /api/v2/metrics/ endpoint with Prometheus to monitor sessions, jobs, and other instantaneous metrics.
weight: 61
---

A metrics endpoint is available in the API, `/api/v2/metrics/`, that surfaces instantaneous metrics about Ascender, which can be consumed by system monitoring software like the open source project Prometheus.

The type of data shown at the `metrics/` endpoint is `Content-type: text/plain` and `application/json` as well. This endpoint contains useful information, such as counts of how many active user sessions there are, or how many jobs are actively running on each Ascender node. Prometheus can be configured to scrape these metrics from Ascender by hitting the Ascender metrics endpoint and storing this data in a time-series database. Clients can later use Prometheus in conjunction with other software like Grafana or Metricsbeat to visualize that data and set up alerts.

## Set up Prometheus

To set up and use Prometheus, you will need to install Prometheus on a virtual machine or container. Refer to the [Prometheus documentation](https://prometheus.io/docs/introduction/first_steps/) for further detail.

1. In the Prometheus config file (typically `prometheus.yml`), specify a `<token_value>`, a valid user/password for an Ascender user you have created, and an `<ascender_host>`.

   Alternatively, you can provide an OAuth2 token (which can be generated at `/api/v2/users/N/personal_tokens/`). By default, the config assumes a user with username=admin and password=password.

   Using an OAuth2 token, created at the `/api/v2/tokens` endpoint, to authenticate Prometheus with Ascender, the following example provides a valid scrape config if the URL for your Ascender's metrics endpoint was `https://ascender_host:443/api/v2/metrics/`.

   ```yaml
   scrape_configs

     - job_name: 'awx'
       tls_config:
           insecure_skip_verify: True
       metrics_path: /api/v2/metrics
       scrape_interval: 5s
       scheme: https
       bearer_token: <token_value>
       # basic_auth:
       #   username: admin
       #   password: password
       static_configs:
           - targets:
               - <ascender_host>
   ```

   For help configuring other aspects of Prometheus, such as alerts and service discovery configurations, refer to the [Prometheus configuration docs](https://prometheus.io/docs/prometheus/latest/configuration/configuration/).

   If Prometheus is already running, you must restart it in order to apply the configuration changes by making a **POST** to the reload endpoint, or by killing the Prometheus process or service.

2. Use a browser to navigate to your graph in the Prometheus UI at `http://your_prometheus:9090/graph` and test out some queries. For example, you can query the current number of active Ascender user sessions by executing: `awx_sessions_total{type="user"}`.

   ![Prometheus UI graph showing the result of an awx_sessions_total query](/assets/images/metrics-prometheus-ui-query-example.webp)

Refer to the metrics endpoint in the Ascender API for your instance (`api/v2/metrics`) for more ways to query.
