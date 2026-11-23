---
title: Querying the API
description: Sort, search, filter, and paginate Ascender REST API collections, and identify read-only fields.
weight: 1
---

## Sorting

To provide examples that are easy to follow, the following URL is used throughout this guide:

```text
http://<server name>/api/v2/groups/
```

To specify that `{{ model_verbose_name_plural }}` are returned in a particular order, use the `order_by` query string parameter on the **GET** request.

```text
http://<server name>/api/v2/model_verbose_name_plural?order_by={{ order_field }}
```

Prefix the field name with a dash (`-`) to sort in reverse:

```text
http://<server name>/api/v2/model_verbose_name_plural?order_by=-{{ order_field }}
```

Multiple sorting fields may be specified by separating the field names with a comma (`,`):

```text
http://<server name>/api/v2/model_verbose_name_plural?order_by={{ order_field }},some_other_field
```

## Searching

Use the search query string parameter to perform a non-case-sensitive search within all designated text fields of a model:

```text
http://<server name>/api/v2/model_verbose_name?search=findme
```

Search across related fields:

```text
http://<server name>/api/v2/model_verbose_name?related__search=findme
```

## Filtering

Any collection is what the system calls a "queryset" and can be filtered via various operators.

For example, to find the groups that contain the name "foo":

```text
http://<ascender server name>/api/v2/groups/?name__contains=foo
```

To find an exact match:

```text
http://<ascender server name>/api/v2/groups/?name=foo
```

If a resource is of an integer type, you must add `__int` to the end to cast your string input value to an integer, like so:

```text
http://<ascender server name>/api/v2/arbitrary_resource/?x__int=5
```

Related resources can also be queried, like so:

```text
http://<ascender server name>/api/v2/users/?first_name__icontains=kim
```

This will return all users with names that include the string "Kim" in them.

You can also filter against multiple fields at once:

```text
http://<ascender server name>/api/v2/inventories/?name__icontains=test&has_active_failures=false
```

This finds all inventories whose name contains "test" and that have no hosts with active failures.

For more about what types of operators are available, refer to the [Django QuerySet API reference](https://docs.djangoproject.com/en/dev/ref/models/querysets/).

<Hint type="note">

You can also watch the API as the UI is being used to see how it is filtering on various criteria.

</Hint>

Any additional query string parameters may be used to filter the list of results returned to those matching a given value. Only fields and relations that exist in the database may be used for filtering. Any special characters in the specified value should be url-encoded. For example:

```text
?field=value%20xyz
```

Fields may also span relations, only for fields and relationships defined in the database:

```text
?other__field=value
```

To exclude results matching certain criteria, prefix the field parameter with `not__`:

```text
?not__field=value
```

By default, all query string filters are AND'ed together, so only the results matching all filters will be returned. To combine results matching any one of multiple criteria, prefix each query string parameter with `or__`:

```text
?or__field=value&or__field=othervalue
?or__not__field=value&or__field=othervalue
```

The default AND filtering applies all filters simultaneously to each related object being filtered across database relationships. The chain filter instead applies filters separately for each related object. To use, prefix the query string parameter with `chain__`:

```text
?chain__related__field=value&chain__related__field2=othervalue
?chain__not__related__field=value&chain__related__field2=othervalue
```

If the first query above were written as `?related__field=value&related__field2=othervalue`, it would return only the primary objects where the same related object satisfied both conditions. As written using the chain filter, it would return the intersection of primary objects matching each condition.

Field lookups may also be used for more advanced queries, by appending the lookup to the field name:

```text
?field__lookup=value
```

The following field lookups are supported:

- `exact`: Exact match (default lookup if not specified).
- `iexact`: Case-insensitive version of exact.
- `contains`: Field contains value.
- `icontains`: Case-insensitive version of contains.
- `startswith`: Field starts with value.
- `istartswith`: Case-insensitive version of startswith.
- `endswith`: Field ends with value.
- `iendswith`: Case-insensitive version of endswith.
- `regex`: Field matches the given regular expression.
- `iregex`: Case-insensitive version of regex.
- `gt`: Greater than comparison.
- `gte`: Greater than or equal to comparison.
- `lt`: Less than comparison.
- `lte`: Less than or equal to comparison.
- `isnull`: Check whether the given field or related object is null; expects a boolean value.
- `in`: Check whether the given field's value is present in the list provided; expects a list of items.
- Boolean values may be specified as `True` or `1` for true, `False` or `0` for false (both case-insensitive).

For example, `?created__gte=2023-01-01` will provide a list of items created after 1/1/2023.

Null values may be specified as `None` or `Null` (both case-insensitive), though it is preferred to use the `isnull` lookup to explicitly check for null values.

Lists (for the `in` lookup) may be specified as a comma-separated list of values.

Filtering based on the requesting user's level of access by query string parameter:

- `role_level`: Level of role to filter on, such as `admin_role`

## Pagination

Responses for collections in the API are paginated. This means that while a collection may contain tens or hundreds of thousands of objects, in each web request, only a limited number of results are returned for API performance reasons.

When you get back the result for a collection you will see something similar to the following:

```text
{'count': 25, 'next': 'http://testserver/api/v2/some_resource?page=2', 'previous': None, 'results': [ ... ] }
```

To get the next page, simply request the page given by the 'next' sequential URL.

Use the `page_size=XX` query string parameter to change the number of results returned for each request.

The `page_size` is capped at 200: a larger value, for example `?page_size=1000`, returns 200 results per page. The cap cannot be changed.

Use the `page` query string parameter to retrieve a particular page of results.

```text
http://<server name>/api/v2/model_verbose_name?page_size=100&page=2
```

The previous and next links returned with the results will set these query string parameters automatically.

The serializer is quite efficient, but you should probably not request page sizes beyond a couple of hundred.

The user interface uses smaller values to avoid the user having to do a lot of scrolling.

## Read-only Fields

Certain fields in the REST API are marked read-only. These usually include the URL of a resource, the ID, and occasionally some internal fields. For instance, the `created_by` attribute of each object indicates which user created the resource, and cannot be edited.

If you post some values and notice that they are not changing, these fields may be read-only.
