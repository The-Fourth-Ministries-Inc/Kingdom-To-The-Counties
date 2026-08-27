> **DRAFT — not live store text.** Do not paste this into App Store Connect as
> a production listing until a human at The Fourth Ministries, Inc. reviews and
> approves it. Screenshots, age rating answers, and the review build's Day PIN
> are still human steps.

# App Store listing draft

## Identity

- **Name (30):** Ambassador Companion
- **Subtitle (30):** Field tools for K2C crews
- **Bundle ID:** `com.thefourthministries.ambassadorcompanion`
- **SKU (suggested):** `ambassador-companion`
- **Primary language:** English (US)
- **Publisher:** The Fourth Ministries, Inc.

## Category

- **Primary:** Lifestyle
- **Secondary:** Productivity

Lifestyle matches a ministry field companion. Productivity is the fallback if
Apple wants a tools category. Do not use Social Networking: this is not a
public consumer social app.

## Support and privacy URLs

- **Privacy policy:** https://ambassadorcompanion.netlify.app/privacy.html
- **Support:** https://ambassadorcompanion.netlify.app/support.html
- **Marketing / product page:** https://ambassadorcompanion.netlify.app
- **Support email:** info@thefourthministries.com

## Keywords (100-character limit, comma-separated)

```
ministry,volunteer,church,checklist,event,crusade,ambassador,field,capture,worship
```

Character count of that line is under 100. Do not include competitor names.

## Description

Ambassador Companion is the field app for volunteers serving with Kingdom to
the Counties, a ministry of The Fourth Ministries, Inc.

On event day the whole crew shares one live view: setup checklists,
announcements, check-ins, headcount, praises, and issues stay in sync across
phones. Ambassadors can capture a street encounter with a contact-card photo, a
short voice note, or a typed record so the follow-up team is not guessing later.

Before crusade weekends, the Pre-Crusade Mobilization tab holds the season-long
church list, outreach notes, and call plans. Specialists get Tech I/O, trailer
load, radios, scripts, and the counselor booklet without carrying a separate
binder.

The app is for authorized ministry participants. It is locked with the day's
PIN from morning huddle — there is no public sign-up. Information is used to
run the event, not to advertise. See the privacy policy for what is stored and
how to ask for deletion.

## Promotional text (optional, 170)

Live checklists, announcements, and encounter capture for Kingdom to the
Counties ambassadors. Built for phones in the field.

## What's New (first release)

First App Store release of Ambassador Companion for Kingdom to the Counties
volunteers.

## Age rating (questionnaire — human must click through)

- Not directed at children under 13 (see privacy policy).
- No third-party advertising.
- No unrestricted public UGC social network.
- Religious / ministry content is the purpose of the app.
- Likely result: 4+ or similar; complete Apple's form rather than guessing.

## App Review notes (see also reviewer-notes.DRAFT.md)

This app is gated by a rotating Day PIN. Provide the current PIN in the
review notes at submit time. Do not print a standing PIN in this draft.

## Screenshots

Not included in this draft. Capture from a TestFlight build on a current
iPhone; 6.7" required, plus iPad if the binary is universal (the Capacitor
project targets iPhone and iPad). Show: Day PIN gate with privacy link, Now
tab, Quick Capture, Ambassador Resources, Pre-Crusade Mobilization. No
fabricated announcements or counts.

## Encryption / export

The binary sets `ITSAppUsesNonExemptEncryption` to false. The app uses HTTPS
to talk to the ministry's Netlify API. Complete Apple's export question to
match that.
