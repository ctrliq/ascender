---
title: REST API
description: Developer reference for the Ascender REST API, covering tools, the browsable API, and request conventions.
weight: 90
---

Developer reference for the Ascender API.

This guide applies to the latest version of Ascender only. The content in this guide is updated frequently and might contain functionality that is not available in previous versions. Likewise content in this guide can be removed or replaced if it applies to functionality that is no longer available in the latest version.

You can find lots of Ascender discussion and get answers to questions at the [Ascender Discussion Forum](https://github.com/ctrliq/ascender/discussions).

The REST API guide covers the following topics:

- This page: [Tools](#tools), the [Browsable API](#browsable-api), and API [Conventions](#conventions)
- [Querying the API](querying): sorting, searching, filtering, pagination, and read-only fields
- [Access resources](access-resources)
- [Authentication methods](authentication)

## Tools

This document offers a basic understanding of the REST API used by Ascender.

REST stands for Representational State Transfer and is sometimes spelled as "ReST". It relies on a stateless, client-server, and cacheable communications protocol, usually the HTTP protocol.

You may find it helpful to see which API calls the user interface makes in sequence. To do this, you can use the UI from Firebug or Chrome with developer plugins.

Another alternative is [Charles Proxy](http://www.charlesproxy.com/), which offers a visualizer that you may find helpful. While it is commercial software, it can insert itself as an OS X proxy, for example, and intercept both requests from web browsers as well as curl and other API consumers.

Other alternatives include:

- [Fiddler](http://www.telerik.com/fiddler)
- [mitmproxy](https://mitmproxy.org/)
- [Live HTTP headers FireFox extension](https://addons.mozilla.org/en-US/firefox/addon/live-http-headers/)
- [Paros](http://sourceforge.net/projects/paros/)

## Browsable API

REST APIs provide access to resources (data entities) via URI paths. You can visit the Ascender REST API in a web browser at: `http://<server name>/api/`

![The Ascender REST API root page in a web browser](/assets/images/rest-api.webp)

Ascender supports version 2 of the API, which can be accessed by clicking the v2 link next to "current versions" or "available versions":

![The REST API root page listing the current and available API versions](/assets/images/rest-api-available-versions.webp)

If you perform a **GET** just the `/api/` endpoint, it gives the `current_version`, which would be the recommended version.

Clicking on various links in the API allows you to explore related resources.

![The browsable API v2 page with links to related resources](/assets/images/rest-api-discover-resources.webp)

Clicking on the **?** (question mark) icon next to the page name (toward the top of the screen) for an API endpoint gives you documentation on the access methods for that particular API endpoint and what data is returned when using those methods.

You can also use PUT and POST verbs on the specific API pages by formatting JSON in the various text fields.

![A browsable API endpoint page with a JSON content form for a POST request](/assets/images/rest-api-post-to-api-via-form.webp)

You can also view changed settings from factory defaults at `/api/v2/settings/changed/` endpoint. It reflects changes you made in the API browser, not changed settings that come from static settings files.

![The /api/v2/settings/changed/ endpoint listing settings changed from their defaults](/assets/images/rest-api-changed-settings.webp)

## Conventions

Ascender uses a standard REST API, rooted at `/api/` on the server. The API is versioned for compatibility reasons, and currently `api/v2/` is the latest available version. You can see information about what API versions are available by querying `/api/`.

You may have to specify the content/type on **POST** or **PUT** requests accordingly.

- **PUT**: Update a specific resource (by an identifier) or a collection of resources. PUT can also be used to create a specific resource if the resource identifier is known before-hand.
- **POST**: Create a new resource. Also acts as a catch-all verb for operations that do not fit into the other categories.

All URIs not ending with `"/"` receive a 301 redirect.

<Hint type="note">

Formatting of `extra_vars` attached to Job Template records is preserved. YAML is returned as YAML with formatting and comments preserved, and JSON is returned as JSON.

</Hint>
