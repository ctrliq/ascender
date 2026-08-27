from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.db.models import TextField
from django.db.models.fields.related_descriptors import ForwardOneToOneDescriptor, ReverseOneToOneDescriptor
from django.db.models.functions import Cast
from django.db.models.sql import AND
from django.db.models.sql.where import WhereNode

from awx.dab.resource_registry.models import Resource


class CustomForwardOneToOneDescriptor(ForwardOneToOneDescriptor):
    def get_queryset(self, **hints):
        return self.field.remote_field.model._base_manager.db_manager(hints=hints).filter(content_type=ContentType.objects.get_for_model(self.field.model))

    def get_prefetch_querysets(self, instances, querysets=None):
        if querysets and len(querysets) != 1:
            raise ValueError("querysets argument of get_prefetch_querysets() should have a length of 1.")
        queryset = querysets[0] if querysets else self.get_queryset()
        queryset._add_hints(instance=instances[0])

        query = models.Q.create(
            [
                ("object_id__in", {str(obj.pk) for obj in instances}),
            ]
        )

        queryset = queryset.filter(query)

        # I can't find documentation for this anywhere, but this is the best I can come
        # up with for what this tuple is returning:
        # [0]: queryset for the related table
        # [1]: function that returns the value for the related table that needs to match the
        #      current table
        # [2]: function that returns the value for the current table that needs to match the
        #      related table
        # [3]: unknown... but this breaks when set to False.
        # [4]: name of the field that we're joining on the current table
        # [5]: unknown...
        # I think that the queryset is merged on the prefetched queryset based on whether the
        # results of the functions in [1] and [2] match.
        return (
            queryset,
            lambda relobj: relobj.object_id,
            lambda obj: str(obj.pk),
            True,
            self.field.attname,
            False,
        )

    def get_prefetch_queryset(self, instances, queryset=None):  # NOSONAR
        # Django 4 compatibility: renamed to get_prefetch_querysets in Django 5
        if queryset is None:
            return self.get_prefetch_querysets(instances)
        return self.get_prefetch_querysets(instances, [queryset])


class AnsibleResourceField(models.ForeignObject):
    """
    This field creates a reverse one to one relationship to the Resource model
    without adding any new columns to the model. It supports `.select_related`
    and `.<resource_field_name>` lookups the same way that a OneToOneField
    does.
    """

    related_accessor_class = ReverseOneToOneDescriptor
    forward_related_accessor_class = CustomForwardOneToOneDescriptor

    def __init__(self, primary_key_field, **kwargs):
        model = Resource
        from_fields = [primary_key_field]
        to_fields = ["object_id"]

        super().__init__(
            model,
            on_delete=models.DO_NOTHING,
            from_fields=from_fields,
            to_fields=to_fields,
            null=True,
            blank=True,
            editable=False,
            # This informs DRF to exclude the field from serialization by default.
            # It can still be serialized, but the user will have to explicitly
            # declare a serializer to use.
            serialize=False,
            **kwargs,
        )

    def contribute_to_class(self, cls, name, private_only=False, **kwargs):
        # override the default to always make it private
        # this ensures that no additional columns are created
        super().contribute_to_class(cls, name, private_only=True, **kwargs)

    def get_joining_columns(self, reverse_join=False):
        """
        This method normally provides a tuple of tuples, where each pair contains
        the columns to join the two related models on. This returns something like
        "dab_resource_registry_resource"."content_type_id" and
        "aap_gateway_api_organization"."id". The problem here is that the resource
        registry holds a generic foreign key, which is a different column type than
        the local model and Postgres doesn't permit joins across columns of different
        data types. To solve this, we're returning an empty tuple here to disable
        the default join, and instead handling the join in get_extra_restriction().
        """
        return tuple()

    def get_extra_restriction(self, alias, remote_alias):
        """
        Return a pair condition used for joining and subquery pushdown. The
        condition is something that responds to as_sql(compiler, connection)
        method.

        This function casts the local pk field to a text field so that it can
        be joined with Resource.object_id and adds an additional join condition
        for content_type.
        """

        content_type_field = self.remote_field.model._meta.get_field("content_type")
        object_id_field = self.remote_field.model._meta.get_field("object_id")
        pk_field = self.model._meta.get_field("id")
        contenttype_pk = self.get_content_type().pk

        # cast the local pk to a text field
        # resolves to sql: "resource_model"."pk" :: text = "dab_resource_registry_resource"."object_id"
        object_id_lookup = self.get_lookup("exact")(
            Cast(pk_field.get_col(remote_alias), output_field=TextField()),
            object_id_field.get_col(alias),
        )

        # resolves to sql: "dab_resource_registry_resource"."content_type_id" = resource model content type
        content_type_id_lookup = self.get_lookup("exact")(content_type_field.get_col(alias), contenttype_pk)

        return WhereNode([object_id_lookup, content_type_id_lookup], connector=AND)

    def get_extra_descriptor_filter(self, instance):
        """
        Return an extra filter condition for related object fetching when
        user does 'instance.fieldname', that is the extra filter is used in
        the descriptor of the field.

        The filter should be either a dict usable in .filter(**kwargs) call or
        a Q-object. The condition will be ANDed together with the relation's
        joining columns.

        A parallel method is get_extra_restriction() which is used in
        JOIN and subquery conditions.
        """
        return {"content_type": self.get_content_type()}

    def get_content_type(self):
        """
        Return the content type associated with this field's model.
        """
        return ContentType.objects.get_for_model(self.model)


class AssignmentResourceField(models.ForeignObject):
    """
    ForeignObject joining assignment models to Resource via the row's own
    (content_type_id, object_id) — both columns are variable per row.

    Unlike AnsibleResourceField which uses a constant content_type and a
    Cast(pk, TextField), this field joins two columns that already match
    in type (both TextField, both FK to ContentType).

    Added dynamically via contribute_to_class in ResourceRegistryConfig.ready()
    so that dab_rbac works standalone without resource_registry.
    """

    def __init__(self, **kwargs):
        super().__init__(
            Resource,
            on_delete=models.DO_NOTHING,
            from_fields=['object_id'],
            to_fields=['object_id'],
            null=True,
            blank=True,
            editable=False,
            serialize=False,
            **kwargs,
        )

    def contribute_to_class(self, cls, name, private_only=False, **kwargs):
        super().contribute_to_class(cls, name, private_only=True, **kwargs)

    def get_extra_restriction(self, alias, remote_alias):
        resource_ct_field = self.remote_field.model._meta.get_field("content_type")
        local_ct_field = self.model._meta.get_field("content_type")

        ct_lookup = self.get_lookup("exact")(
            local_ct_field.get_col(remote_alias),
            resource_ct_field.get_col(alias),
        )
        return WhereNode([ct_lookup], connector=AND)

    def get_extra_descriptor_filter(self, instance):
        return {"content_type_id": instance.content_type_id}
