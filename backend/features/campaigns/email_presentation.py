"""Concise email presentation from pinned card terms and saved benefit selections."""

from html import escape

VERSION = "card-email-html-v2"


def render(product, benefit_ids, recipient_name, sender_name):
    benefits = [product["benefits"][key] for key in benefit_ids[:2]]
    name = product["name"]
    fee = f"₹{product['annualFeeMinor'] / 100:,.2f}"
    subject = f"[BankWeave TEST] Explore {name}"
    footer = "Demo preview using synthetic data. Not a pre-approved offer. Separate application, bank checks and consent required."
    text = (
        f"{name}\n\nHi {recipient_name},\n\n"
        "Here's a quick look at this card.\n\nKey benefits\n"
        + "\n".join("• " + benefit for benefit in benefits)
        + f"\n\nAnnual fee: {fee} per year\n\n"
        "Reply to this email if you'd like more information.\n\n"
        f"Kind regards,\n{sender_name}\nBankWeave\n\n{footer}\n"
    )
    items = "".join(
        f'<li style="margin:0 0 10px;padding-left:4px">{escape(benefit)}</li>'
        for benefit in benefits
    )
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(name)}</title></head>
<body style="margin:0;padding:0;background:#f3f5f8;color:#172b40;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">A quick look at {escape(name)} — benefits and annual fee.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#fff;border:1px solid #e1e6ed;border-radius:14px;overflow:hidden">
<tr><td style="padding:20px 26px;background:#142b43;color:#fff;font-size:14px;font-weight:bold;letter-spacing:2px">BANKWEAVE</td></tr>
<tr><td style="padding:26px">
<p style="margin:0 0 10px;color:#536a82;font-size:11px;font-weight:bold;letter-spacing:1.5px">CARD OVERVIEW</p>
<h1 style="margin:0 0 24px;font-size:26px;line-height:1.25;color:#142b43">{escape(name)}</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.7">Hi {escape(recipient_name)},</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.7">Here's a quick look at this card.</p>
<h2 style="margin:0 0 12px;font-size:16px;color:#142b43">Key benefits</h2>
<ul style="margin:0 0 22px;padding-left:20px;font-size:14px;line-height:1.7;color:#40536a">{items}</ul>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4fc;border-radius:8px"><tr><td style="padding:16px 18px;font-size:13px;line-height:1.8"><strong>Annual fee</strong><br><span style="font-size:22px;font-weight:bold;color:#142b43">{escape(fee)}</span> <span style="color:#536a82">/ year</span></td></tr></table>
<p style="margin:22px 0;font-size:14px;line-height:1.7">Reply to this email if you'd like more information.</p>
<p style="margin:0;font-size:14px;line-height:1.8">Kind regards,<br><strong style="font-size:16px;color:#142b43">{escape(sender_name)}</strong><br><span style="color:#536a82">BankWeave</span></p>
</td></tr><tr><td style="padding:18px 26px;border-top:1px solid #e6eaf0;color:#64748b;font-size:11px;line-height:1.6">{escape(footer)}</td></tr>
</table></td></tr></table></body></html>"""
    return dict(subject=subject, text=text, html=html, version=VERSION)
