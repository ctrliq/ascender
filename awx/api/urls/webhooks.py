from django.urls import re_path

from awx.api.views.webhooks import WebhookKeyView, GithubWebhookReceiver, GitlabWebhookReceiver, BitbucketDcWebhookReceiver


urlpatterns = [
    re_path(r'^webhook_key/$', WebhookKeyView.as_view(), name='webhook_key'),
    re_path(r'^github/$', GithubWebhookReceiver.as_view(), name='webhook_receiver_github'),
    re_path(r'^gitlab/$', GitlabWebhookReceiver.as_view(), name='webhook_receiver_gitlab'),
    re_path(r'^bitbucket_dc/$', BitbucketDcWebhookReceiver.as_view(), name='webhook_receiver_bitbucket_dc'),
]
