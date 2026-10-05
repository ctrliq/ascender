.. _ag_proxy_support:

Proxy Support
=============

.. index::
   single: proxy support
   pair: proxy; X-Forwarded-For
   pair: REMOTE_HOST_HEADERS; proxy support
   pair: PROXY_IP_ALLOWED_LIST; proxy support
   pair: provisioning callbacks; proxy support

Ascender primarily runs on Kubernetes. When Ascender runs on Kubernetes, requests reach it through an ingress controller and, often, an external load balancer. The connection Ascender receives comes from that proxy, not from the original client. This matters for features that use the client's address, most importantly :ref:`ug_provisioning_callbacks`, where Ascender uses the address of the request to decide which inventory host to run the job against.

Two settings control how Ascender determines the client address. Both are under **Miscellaneous System settings** in the Settings menu, and both are also available through the ``/api/v2/settings/system/`` endpoint.


Remote Host Headers
-------------------

``REMOTE_HOST_HEADERS`` lists the request headers and server variables that Ascender reads to find the client's address. The default is::

   ["REMOTE_ADDR", "REMOTE_HOST"]

``REMOTE_ADDR`` is the address of the connection Ascender receives. Behind an ingress, that is always the ingress controller. To use the client address that the ingress passes in the ``X-Forwarded-For`` header, set::

   ["HTTP_X_FORWARDED_FOR"]

For provisioning callbacks, Ascender collects every address from every header in this list, including each entry of a comma-separated ``X-Forwarded-For`` header, and treats all of them as candidates for the calling host. If ``REMOTE_ADDR`` stays in the list, the ingress address remains a candidate alongside the real client address.

.. note::

   The web container's own nginx proxy can add the address it received the request from to ``X-Forwarded-For``, depending on the Ascender version. In that case the ingress address appears in ``X-Forwarded-For`` even when ``REMOTE_ADDR`` is not in the list. Do not put ingress controller or cluster node addresses in an inventory used for provisioning callbacks.

Ascender also uses this setting to record the client address on login events.


Proxy IP Allowed List
---------------------

``PROXY_IP_ALLOWED_LIST`` limits which proxies Ascender accepts custom headers such as ``X-Forwarded-For`` from. When the list is set, Ascender discards those headers on any request whose connection address is not in the list. When the list is empty (the default), Ascender accepts them from any source.

Entries must be exact IP addresses. CIDR ranges are not supported. Inside Kubernetes, the connection address is usually the ingress controller's pod IP, which changes whenever the pod is rescheduled. If the list contains a pod IP, Ascender stops trusting ``X-Forwarded-For`` as soon as the ingress pod restarts, and provisioning callbacks stop matching. Only use this setting when the address that connects to Ascender is stable.


Preserving the Client Address
-----------------------------

Reading ``X-Forwarded-For`` only helps if the ingress puts the real client address in it. If a load balancer in front of the ingress replaces the source address, the ingress records the load balancer's address instead. For a Kubernetes ``LoadBalancer`` or ``NodePort`` Service, setting ``externalTrafficPolicy: Local`` on the ingress controller's Service keeps the original source address.

K3s
~~~

K3s exposes its packaged Traefik ingress controller through the built-in ServiceLB load balancer. With the default ``externalTrafficPolicy: Cluster``, ServiceLB replaces the client's source address, and Ascender never receives the real client address.

To keep the client address, create ``/var/lib/rancher/k3s/server/manifests/traefik-config.yaml`` on a K3s server node:

.. code-block:: yaml

   apiVersion: helm.cattle.io/v1
   kind: HelmChartConfig
   metadata:
     name: traefik
     namespace: kube-system
   spec:
     valuesContent: |-
       service:
         spec:
           externalTrafficPolicy: Local

K3s applies the file automatically. If ``traefik-config.yaml`` already exists, merge the ``service`` section into it instead of replacing the file. Do not edit the packaged ``traefik.yaml`` manifest, because K3s rewrites it at startup.

Confirm the change:

.. code-block:: bash

   kubectl -n kube-system get svc traefik -o jsonpath='{.spec.externalTrafficPolicy}{"\n"}'

.. warning::

   Applying this change redeploys the Traefik Service and its ServiceLB pods, which briefly interrupts access to Ascender and anything else served through Traefik. On a multi-node cluster, ``externalTrafficPolicy: Local`` means a node only accepts traffic for Traefik if a Traefik pod runs on that node. K3s also documents that this policy does not work correctly if ``node-external-ip`` is set on any node.


Security Considerations
-----------------------

When Ascender trusts ``X-Forwarded-For``, anyone who can send a request directly to Ascender, without going through the ingress, could supply a forged address. The Ascender web Service is a ``ClusterIP`` Service, so clients outside the cluster can only reach it through the ingress. Make sure the ingress controller overwrites any ``X-Forwarded-For`` header sent by the client instead of appending to it. The packaged Traefik ingress on K3s discards client-supplied ``X-Forwarded-For`` headers by default.

For provisioning callbacks specifically, see :ref:`ug_provisioning_callbacks` for how to check which inventory host Ascender matches for a given server.
