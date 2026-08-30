from django.apps import AppConfig


class JwtConsumerConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'awx.dab.jwt_consumer'
    label = 'dab_jwt_consumer'
