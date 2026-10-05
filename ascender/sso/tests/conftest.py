import pytest

from django.contrib.auth.models import User


@pytest.fixture
def existing_normal_user():
    try:
        user = User.objects.get(username="alice")
    except User.DoesNotExist:
        user = User(username="alice", password="password")
        user.save()
    return user
