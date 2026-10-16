"""Source-currency and historical-period formatting."""

import calendar


def period_label(period):
    if period == "all":
        return "All months"
    year, month = map(int, period.split("-"))
    return f"{calendar.month_name[month]} {year}"


def previous_period(period):
    if period == "all":
        return "all"
    year, month = map(int, period.split("-"))
    return f"{year if month > 1 else year - 1}-{month - 1 if month > 1 else 12:02}"


def currency(value, unit):
    if unit == "USD":
        return f"${value:,.2f}"
    if value >= 10_000_000:
        return f"₹{value / 10_000_000:.2f} Cr"
    if value >= 100_000:
        return f"₹{value / 100_000:.2f} L"
    return f"₹{value:,.0f}"
