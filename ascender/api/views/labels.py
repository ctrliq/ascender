# Ascender
from ascender.api.generics import SubListCreateAttachDetachAPIView, RetrieveUpdateDestroyAPIView, ListCreateAPIView
from ascender.main.models import Label
from ascender.api.serializers import LabelSerializer

# Django
from django.utils.translation import gettext_lazy as _

# Django REST Framework
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework.status import HTTP_204_NO_CONTENT, HTTP_400_BAD_REQUEST, HTTP_409_CONFLICT


class LabelSubListCreateAttachDetachView(SubListCreateAttachDetachAPIView):
    """
    For related labels lists like /api/v2/inventories/N/labels/

    We want want the last instance to be deleted from the database
    when the last disassociate happens.

    Subclasses need to define parent_model
    """

    model = Label
    serializer_class = LabelSerializer
    relationship = 'labels'

    def unattach(self, request, *args, **kwargs):
        sub_id, res = super().unattach_validate(request)
        if res:
            return res

        res = super().unattach_by_id(request, sub_id)

        obj = self.model.objects.get(id=sub_id)

        if obj.is_detached():
            obj.delete()

        return res

    def post(self, request, *args, **kwargs):
        # If a label already exists in the database, attach it instead of erroring out
        # that it already exists
        if 'id' not in request.data and 'name' in request.data and 'organization' in request.data:
            existing = Label.objects.filter(name=request.data['name'], organization_id=request.data['organization'])
            if existing.exists():
                existing = existing[0]
                request.data['id'] = existing.id
                del request.data['name']
                del request.data['organization']

        # Give a 400 error if we have attached too many labels to this object
        label_filter = self.parent_model._meta.get_field(self.relationship).remote_field.name
        if Label.objects.filter(**{label_filter: self.kwargs['pk']}).count() > 100:
            return Response(dict(msg=_(f'Maximum number of labels for {self.parent_model._meta.verbose_name_raw} reached.')), status=HTTP_400_BAD_REQUEST)

        return super().post(request, *args, **kwargs)


class LabelDetail(RetrieveUpdateDestroyAPIView):
    """
    Labels used to have no way to be deleted. They were owned by whatever
    carried them: the sublist view above deletes one when its last attachment
    goes, so a label that nothing references stopped existing on its own and
    the only labels reachable were the ones in use.

    A label can now be created on its own, from the Labels screen, and one made
    that way is attached to nothing, so that cleanup never fires and it would
    have been permanent. Deleting is how it goes away.

    Only a label attached to nothing can be deleted. A label is shared across
    everything that carries it, templates, inventories, schedules and workflow
    nodes of any organization as well as finished jobs, and deleting it would
    strip it from all of them at once. Detaching never touches job history,
    since Label.is_detached keeps a label that any job still carries, so a
    DELETE on a label in use is refused with 409 and the label has to be
    detached from its holders first.
    """

    model = Label
    serializer_class = LabelSerializer

    def destroy(self, request, *args, **kwargs):
        """
        Delete the label, provided the user may and nothing carries it.

        The permission check comes first, so a user who may not delete the
        label learns nothing about where it is used.

        Args:
            request: The DELETE request.
            *args: Positional arguments of the URL route.
            **kwargs: Keyword arguments of the URL route, the label's pk.

        Returns:
            Response: 204 once deleted, 409 when the label is still attached.

        Raises:
            PermissionDenied: When the user may not delete the label.
        """
        label = self.get_object()
        if not self.has_delete_permission(label):
            raise PermissionDenied()
        if not label.is_detached():
            return Response(
                {
                    'detail': _(
                        'This label is still attached to templates, inventories, schedules, workflow nodes or jobs. Detach it from them before deleting it.'
                    )
                },
                status=HTTP_409_CONFLICT,
            )
        self.perform_destroy(label, check_permission=False)
        return Response(status=HTTP_204_NO_CONTENT)


class LabelList(ListCreateAPIView):
    name = _("Labels")
    model = Label
    serializer_class = LabelSerializer
