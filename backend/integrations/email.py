"""Private SMTP transport. Never logs credentials, SMTP replies or message bodies."""

import os
import re
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage


class MailError(Exception):
    def __init__(self, message, uncertain=False):
        super().__init__(message)
        self.uncertain = uncertain


def address(value):
    if not re.fullmatch(
        r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", value or ""
    ):
        raise ValueError("Configure a valid sender and test-recipient email address.")
    return value


@dataclass(frozen=True, repr=False)
class MailSettings:
    host: str
    port: int
    username: str
    password: str
    sender: str
    recipient: str
    daily_limit: int


def settings():
    if os.getenv("BANKWEAVE_EMAIL_ENABLED", "false").lower() != "true":
        raise ValueError("Test email sending is disabled in the backend configuration.")
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = address(os.getenv("SMTP_USERNAME", ""))
    sender = address(os.getenv("SMTP_FROM", username))
    recipient = address(os.getenv("BANKWEAVE_EMAIL_TEST_RECIPIENT", ""))
    password = os.getenv("SMTP_PASSWORD", "")
    if (
        not password
        or not host
        or port != 587
        or os.getenv("SMTP_STARTTLS", "true").lower() != "true"
    ):
        raise ValueError(
            "Configure authenticated SMTP on port 587 with STARTTLS before sending."
        )
    limit = int(os.getenv("BANKWEAVE_EMAIL_TEST_DAILY_LIMIT", "5"))
    if not 1 <= limit <= 20:
        raise ValueError("Set the daily test-email allowance between 1 and 20.")
    return MailSettings(host, port, username, password, sender, recipient, limit)


def send_mail(config, message):
    """Success means SMTP acceptance, not proof of arrival in the recipient inbox."""
    client = None
    submitting = False
    try:
        client = smtplib.SMTP(config.host, config.port, timeout=10)
        client.ehlo()
        client.starttls(context=ssl.create_default_context())
        client.ehlo()
        client.login(config.username, config.password)
        submitting = True
        refused = client.send_message(
            message, from_addr=config.sender, to_addrs=[config.recipient]
        )
        if refused:
            raise MailError("The mail server rejected the test recipient.")
    except MailError:
        raise
    except (
        smtplib.SMTPRecipientsRefused,
        smtplib.SMTPSenderRefused,
        smtplib.SMTPDataError,
    ) as error:
        raise MailError(
            "The mail server rejected the message. Check sender configuration and account limits."
        ) from error
    except smtplib.SMTPAuthenticationError as error:
        raise MailError(
            "SMTP authentication failed. Check the sender and App Password privately."
        ) from error
    except Exception as error:
        raise MailError(
            "SMTP confirmation was interrupted. Check the recipient inbox before taking further action."
            if submitting
            else "Could not connect securely to the mail server. Check the backend SMTP settings.",
            uncertain=submitting,
        ) from error
    finally:
        if client is not None:
            try:
                client.quit()
            except Exception:
                try:
                    client.close()
                except Exception:
                    pass


def message(sender, recipient, subject, body, message_id, html=None):
    value = EmailMessage()
    value["From"] = sender
    value["To"] = recipient
    value["Subject"] = subject
    value["Message-ID"] = message_id
    from email.utils import formatdate

    value["Date"] = formatdate(localtime=False)
    value.set_content(body)
    if html is not None:
        value.add_alternative(html, subtype="html")
    return value
