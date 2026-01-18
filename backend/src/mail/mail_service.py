from django.conf import settings

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase

from django.utils.translation import activate, get_language
from django.template.loader import render_to_string
from django.utils.translation import gettext


class Email:
    reset_password = {
        "subject": lambda fn:  fn("Reset Password"),
        "template": "emails/forgot_password.html",
        "fields": ["name", "reset_link"],
    }
    welcome = {
        "subject": lambda fn: fn("Welcome") + "!",
        "template": "emails/welcome_email.html",
        "fields": ["name", "contact_email"],
    }

    def __init__(
        self,
        recipient: str,
        language_code: str = "en",
        sender: str = settings.SENDER_EMAIL,
        smtp_server: str = settings.SMTP_SERVER,
        smtp_port: int = settings.SMTP_PORT,
        smtp_password: str = settings.SENDER_PASSWORD,
    ):
        self.recipient = recipient
        self.sender = sender
        self.smtp_server = smtp_server
        self.smtp_port = smtp_port
        self.smtp_password = smtp_password
        self.language_code = language_code

    def _get_msg(self, subject: str) -> MIMEMultipart:
        msg = MIMEMultipart()
        msg["From"] = self.sender
        msg["To"] = self.recipient
        msg["Subject"] = subject
        return msg

    def _validate_fields(self, email_template: dict, mail_values: dict | None):
        if len(email_template["fields"]) != 0 and mail_values is None:
            raise ValueError(f"Missing data: {email_template["fields"]}")
        missing_data = set(email_template["fields"]) - set(mail_values.keys())
        if len(missing_data) != 0:
            raise ValueError(f"Missing data: {missing_data}")

    def send(
        self,
        email_template: dict,
        mail_values: dict | None = None,
        attachments: list[MIMEBase] | None = None,
    ):
        self._validate_fields(email_template, mail_values)
        current_language = get_language()
        activate(self.language_code)
        try:
            msg = self._get_msg(email_template["subject"](gettext))

            html_content = render_to_string(
                email_template["template"],
                mail_values | {"site_domain": settings.SITE_DOMAIN},
            )

            msg.attach(MIMEText(html_content, "html"))

            if attachments is not None:
                for attachment in attachments:
                    msg.attach(attachment)

            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender, self.smtp_password)
                server.sendmail(self.sender, self.recipient, msg.as_string())

            print("Email sent successfully!")

        except Exception as e:
            print(f"Failed to send email: {e}")
        finally:
            activate(current_language)
