from django.utils.translation import gettext

'''
Simple helper class that can be used to translate messages or not translate messages.
Ex: Function that calls a raise ValidationError and logger.error one after the other.
'''


class translatableConditionally:
    def __init__(self, message):
        self.message = message

    def not_translated(self):
        return self.message

    def translated(self):
        return gettext(self.message)
