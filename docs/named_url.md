# Named URLs

A named URL names an object by human-readable fields instead of its primary
key. `/api/v2/hosts/2/` and `/api/v2/hosts/host_name++inv_name++org_name/`
can address the same host. Named URLs work for the object's detail URL and
for every URL below it: if `/api/v2/job_templates/Deploy++Default/` is valid,
so is `/api/v2/job_templates/Deploy++Default/launch/`.

The implementation is `src/internal/api/named_urls.go`.


## Usage

Two read-only settings under `/api/v2/settings/named-url/` describe the
named URLs: `NAMED_URL_FORMATS` and `NAMED_URL_GRAPH_NODES`.

`NAMED_URL_FORMATS` lists every resource that has named URLs, with the format
of its identifier:

```
"NAMED_URL_FORMATS": {
    "execution_environments": "<name>",
    "organizations": "<name>",
    "teams": "<name>++<organization.name>",
    "credential_types": "<name>+<kind>",
    "credentials": "<name>++<credential_type.name>+<credential_type.kind>++<organization.name>",
    "notification_templates": "<name>++<organization.name>",
    "job_templates": "<name>++<organization.name>",
    "projects": "<name>++<organization.name>",
    "inventories": "<name>++<organization.name>",
    "hosts": "<name>++<inventory.name>++<organization.name>",
    "groups": "<name>++<inventory.name>++<organization.name>",
    "inventory_sources": "<name>++<inventory.name>++<organization.name>",
    "instance_groups": "<name>",
    "workflow_job_templates": "<name>++<organization.name>",
    "workflow_job_template_nodes": "<identifier>++<workflow_job_template.name>++<organization.name>",
    "labels": "<name>++<organization.name>",
    "applications": "<name>++<organization.name>",
    "users": "<username>",
    "instances": "<hostname>"
}
```

The key is the resource's name in the API path; the value says how to build
the identifier. A resource not listed has no named URLs. The list is fixed:
both settings are served from `src/internal/api/metadata/setting_named_url.json`,
captured from the old application, and they cannot be changed.

To build the named URL of the label with id 5 by hand, take the `labels`
format, `<name>++<organization.name>`:

1. `<name>` is the `name` field of `/api/v2/labels/5/`, say `Foo`.
2. `++` separates the parts of the identifier: `Foo++`.
3. `<organization.name>` is a field of the object the label's `organization`
   points to. Follow `related.organization` (say `/api/v2/organizations/3/`)
   and take its `name`, say `Default`. The named URL is
   `/api/v2/labels/Foo++Default/`.

When the foreign key is empty (a label with no organization), its part is the
empty string: `/api/v2/labels/Foo++/`.

Inside one resource's part, fields are separated by a single `+`, as in a
credential type's `<name>+<kind>` (`Machine+ssh`). The parts of the related
objects follow the resource's own part, separated by `++`, in the order of
the format.

Because the identifier is part of a URL path, the characters `;/?:@=&[]` in a
field are percent-encoded. A `+` in a field is written `[+]`, since a bare
`+` separates fields. An organization named `[+]` has the identifier
`%5B[+]%5D`: the brackets are percent-encoded and the `+` becomes `[+]`.

Every object of a listed resource has a `named_url` in its `related` field in
detail views and in the response to the `POST` that created it, never in list
views. `NAMED_URL_GRAPH_NODES` is the same information as a graph, for
building named URLs in code: for each resource, its identifying `fields` and
an `adj_list` of `[foreign key, resource]` pairs to follow.

> **Notes.**
> - The server decodes the path before it looks at the identifier, so a
>   field containing `/` cannot be used in a named URL even when it is
>   written `%2F`. Use the object's id.
> - A constructed or federated inventory shows a `named_url` under its own
>   endpoint (`/api/v2/constructed_inventories/<name>++<org>/`), which does
>   not resolve. The same identifier under `/api/v2/inventories/` does, as
>   in the old application.
> - Other characters, `%` among them, are written as they are. A field
>   whose value looks like a percent-escape (`%41`) is decoded when the
>   named URL is read, so it does not resolve either.


## Resolving named URLs

Before routing, the API looks at every path of the form
`/api/v2/<resource>/<identifier>/...` where `<resource>` has a format
(`Server.namedURLs`):

* An identifier made only of digits that is not zero is a primary key and is
  left alone, leading zeros and all: `/api/v2/organizations/007/` is
  organization 7, even if an organization is named `007`. All zeros (`0`,
  `000`) is read as a name.
* Otherwise the identifier is split into its parts and fields (`[+]` is read
  as a literal `+`, and each field is percent-decoded as Python's
  `urllib.parse.unquote` did) and the first object whose fields match, in id
  order, replaces the identifier with its id. An empty part puts no
  condition on that foreign key.
* An identifier that has the right shape but matches nothing becomes id `0`,
  so the request is answered as for a missing object: `404`, or `401` for an
  anonymous user, who cannot learn which names exist.
* An identifier with the wrong shape (too many or too few parts or fields) is
  left in the path as it is, where it is not a valid id.
* A request whose identifier was replaced and that is refused with `403` is
  answered `404` with `{"detail": "Not found."}` instead, without an `Allow`
  header, so that a named URL never confirms that an object exists.
  Through the id the same request answers `403`.


## Job Template Organization Changes

The `organization` of a job template, derived from its project, is part of
its named URL so that job templates with the same name in different
organizations can be told apart. The older form without the organization
still works: `/api/v2/job_templates/<name>/` resolves to the job template
with that name whose organization was created first (`namedURLToID`). The
name is percent-decoded first, and an identifier that Python's `int()` would
read as a number (`-7`, ` 7`, `1_000`) is never taken for a name.
