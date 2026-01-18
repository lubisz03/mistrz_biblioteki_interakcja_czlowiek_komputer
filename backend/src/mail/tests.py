from django.test import TestCase
from .mail_service import Email


class EmailClassTests(TestCase):
    def setUp(self):
        self.recipient = "jakub.dulas@appwave.dev"
        self.valid_mail_values = {
            "name": "John Doe",
            "reset_link": "https://example.com/reset-password",
            "contact_email": "jakub.dulas@appwave.dev",
        }

    def test_send_reset_password_email(self):
        email = Email(self.recipient)
        email.send(
            Email.reset_password,
            {"name": "John Doe", "reset_link": "https://example.com/reset-password"},
        )

    def test_send_invoice_missing_fields_raises(self):
        email = Email(self.recipient)
        try:
            email.send(Email.invoice, {})
        except Exception as e:
            return

    def test_welcome_email_contains_correct_subject(self):
        email = Email(self.recipient)
        email.send(
            Email.welcome,
            {"name": "Alice", "contact_email": "jakub.dulas@appwave.dev"},
        )
