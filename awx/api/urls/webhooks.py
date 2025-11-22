from django.urls import path

from awx.api.views.webhooks import WebhookKeyView, GithubWebhookReceiver, GitlabWebhookReceiver, BitbucketDcWebhookReceiver


urlpatterns = [
    path('webhook_key/', WebhookKeyView.as_view(), name='webhook_key'),
    path('github/', GithubWebhookReceiver.as_view(), name='webhook_receiver_github'),
    path('gitlab/', GitlabWebhookReceiver.as_view(), name='webhook_receiver_gitlab'),
    path('bitbucket_dc/', BitbucketDcWebhookReceiver.as_view(), name='webhook_receiver_bitbucket_dc'),
]
