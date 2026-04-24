# Modifications Copyright (c) 2024 Ctrl IQ, Inc.

from pathlib import Path

from django.http import FileResponse, Http404
from django.urls import path
from django.utils.translation import gettext_lazy as _
from django.views.generic import View
from django.views.generic.base import TemplateView


class IndexView(TemplateView):
    template_name = 'index.html'


class MigrationsNotran(TemplateView):
    template_name = 'installing.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        product_name = 'Ascender'
        context['title'] = _('%s Upgrading' % product_name)
        context['image_alt'] = _('Logo')
        context['aria_spinner'] = _('Loading')
        context['message_upgrade'] = _('%s is currently upgrading.' % product_name)
        context['message_refresh'] = _('This page will refresh when complete.')
        return context


class ServiceWorkerView(View):
    def get(self, request, *args, **kwargs):
        service_worker_path = Path(__file__).resolve().parent / 'build' / 'service-worker.js'
        if not service_worker_path.is_file():
            raise Http404()

        response = FileResponse(service_worker_path.open('rb'), content_type='application/javascript')
        response['Service-Worker-Allowed'] = '/'
        response['Cache-Control'] = 'no-cache'
        return response


app_name = 'ui'

urlpatterns = [
    path('service-worker.js', ServiceWorkerView.as_view(), name='service-worker'),
    path('', IndexView.as_view(), name='index'),
    path('migrations_notran/', MigrationsNotran.as_view(), name='migrations_notran'),
]
