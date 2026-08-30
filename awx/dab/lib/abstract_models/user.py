from django.contrib.auth.models import AbstractUser, UserManager


class AbstractDABUser(AbstractUser):
    class Meta(AbstractUser.Meta):
        abstract = True

    # By default, DAB registers a pre_save signal that prevents
    # non-privileged users from changing the email field at the ORM
    # layer (CVE protection).  Set this to True ONLY when your
    # service's serializer fully enforces the email-change policy
    # itself (e.g. via EmailAdminOnlyMixin or an equivalent
    # validate_email / _validate_email_change implementation) AND
    # your service has code paths — such as SSO/authentication
    # pipelines — that perform legitimate ORM-level email updates
    # where no requesting user is present in CRUM, which would
    # conflict with the signal.  When True the signal is not
    # connected and all email-change authorization is the
    # serializer's responsibility.
    EMAIL_ENFORCEMENT_VIA_SERIALIZER = False

    all_objects = UserManager()
    objects = UserManager()
