# Copyright (c) 2026 Ascender
# All Rights Reserved.

from django.db import models

from ascender.main.utils.encryption import decrypt_value, encrypt_value, get_encryption_key

__all__ = ['WorkloadIdentityKey']


class WorkloadIdentityKey(models.Model):
    """
    An RSA key the platform signs workload identity tokens with.

    The newest one signs. Every row is published in the JWKS, so a key that has
    just been rotated out keeps validating the tokens it signed until they run
    out, and `ascender-manage rotate_workload_identity_key` is what drops the
    older ones. The private key is stored encrypted, the same way an OAuth2
    application secret is, and `regenerate_secret_key` re-encrypts it.
    """

    class Meta:
        app_label = 'main'
        ordering = ('-created',)

    kid = models.CharField(max_length=64, unique=True, editable=False)
    private_key = models.TextField(editable=False)
    created = models.DateTimeField(auto_now_add=True, editable=False)

    def __str__(self):
        return self.kid

    def set_private_key(self, pem):
        self.private_key = encrypt_value(pem)

    def get_private_key(self):
        return decrypt_value(get_encryption_key('value', None), self.private_key)
