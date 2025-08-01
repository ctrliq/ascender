## CORS Support

Ascender supports custom CORS headers via the Django CORS Middleware
(https://github.com/ottoyiu/django-cors-headers)

To define CORS-specific settings, add them to ``/etc/tower/conf.d/cors.py``:

```python
CORS_ALLOWED_ORIGINS = (
    'hostname.example.com',
    '127.0.0.1:9000'
)
```

...and restart all Ascender services for changes to take effect.
