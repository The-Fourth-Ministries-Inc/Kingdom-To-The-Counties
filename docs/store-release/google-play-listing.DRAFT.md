> **DRAFT — not live store text.** Do not paste this into Google Play Console
> as a production listing until a human at The Fourth Ministries, Inc. reviews
> and approves it. Feature graphic, screenshots, and content-rating
> questionnaire answers are still human steps.

# Google Play listing draft

## Identity

- **App name (50):** Ambassador Companion
- **Package name / application ID:** `com.thefourthministries.ambassadorcompanion`
- **Default language:** English (United States)
- **Developer / publisher:** The Fourth Ministries, Inc.
- **Play Console account owner:** thefourthministries@gmail.com
- **Contact email:** info@thefourthministries.com

## Category and tags

- **App category:** Productivity
- **Tags (suggestions):** Events, Communication, Tools

Play's Lifestyle category is easy to confuse with consumer lifestyle brands.
Productivity is the closer fit for a volunteer operations companion. A human
can switch to Lifestyle if Play's form reads better that way.

## Support and privacy URLs

- **Privacy policy (required):** https://ambassadorcompanion.netlify.app/privacy.html
- **Support URL:** https://ambassadorcompanion.netlify.app/support.html
- **App website:** https://ambassadorcompanion.netlify.app
- **Support email:** info@thefourthministries.com

## Short description (80)

```
Live checklists and encounter capture for Kingdom to the Counties ambassadors.
```

## Full description (4000)

Ambassador Companion is the field app for volunteers serving with Kingdom to
the Counties, a ministry of The Fourth Ministries, Inc.

On event day the whole crew shares one live view. Setup checklists,
announcements, check-ins, headcount, praises, and issues stay in sync across
phones within a few seconds. Ambassadors can capture a street encounter with a
photo of a contact card, a short voice note, or a typed record so follow-up is
not lost when the crowd moves on.

Before crusade weekends, Pre-Crusade Mobilization holds the season-long church
and ministry list, outreach notes, and next steps. Specialists can open Tech
I/O, the trailer load list, radios, scripts, and the counselor booklet from the
same app.

Ambassador Companion is for authorized ministry participants. Unlocking it
requires the Day PIN from morning huddle. There is no public account sign-up
and no advertising. The Fourth Ministries, Inc. does not sell personal
information. The privacy policy at the URL above explains what is stored and
how to request access, correction, or deletion.

## Store listing assets still needed (human)

- Feature graphic: 1024 × 500
- Phone screenshots: at least 2 (use a signed internal-testing build)
- Optional tablet screenshots if you want a tablet listing
- High-res icon: 512 × 512 (the in-repo `icon-512.png` is a starting point;
  Play also uses the Adaptive Icon inside the AAB)

Do not upload fabricated event data in screenshots.

## Content rating

Complete the IARC questionnaire in Play Console. The app is not directed at
children under 13. It handles ministry contact notes and optional photos/audio
that users choose to attach. There is no ads SDK.

## Data safety form (draft answers — human must confirm)

- Collects: names, contact info, and user-generated ministry notes that
  volunteers enter; photos/audio the user attaches; basic technical logs.
- Purpose: app functionality, account-equivalent Day PIN session, security.
- Not sold. Not used for advertising tracking.
- Encrypted in transit (HTTPS).
- Users can request deletion via info@thefourthministries.com.

## Release tracks

This repository's CI may upload a signed AAB to the **internal testing** track
as a **draft** once Play secrets exist. Promoting to closed/open testing or
production is a Console click by a human. There is no production-submit
workflow.
