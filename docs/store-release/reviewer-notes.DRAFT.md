> **DRAFT — not live review notes.** Fill the current Day PIN at submit time.
> Do not store a standing PIN in git.

# App Review / Play review notes draft

Ambassador Companion is a private volunteer tool for Kingdom to the Counties
(The Fourth Ministries, Inc.). It is not a public consumer social network.

## How to sign in

There is no username/password account. The app opens to a Day PIN gate.

1. Enter any volunteer name.
2. Pick a team (Ambassadors is fine).
3. Enter the Day PIN provided in this review attachment / Play review notes.
4. Tap **Unlock app & check in**.

The privacy policy is linked on that gate and at
https://ambassadorcompanion.netlify.app/privacy.html
Support: https://ambassadorcompanion.netlify.app/support.html
Email: info@thefourthministries.com

## Demo PIN for this review

```
Day PIN: ________ (human fills this in at submit time)
Leader PIN: ________ (only if reviewers need the Leader Dashboard)
```

Use a dedicated review PIN on production or a staging deploy. Do not reuse a
live event-day PIN in a public form if it can be avoided. Rotate it after
review.

## What reviewers should see

- Now tab: live event board (may be empty outside an event; empty is real).
- Ambassador Resources → Quick Capture, Playbook, Privacy Policy.
- Pre-Crusade Mobilization: church list.
- Camera and microphone permission prompts only if the reviewer opens Quick
  Capture (photo/voice) or the teleprompter recorder.

## Permissions

- Camera: contact-card photos and teleprompter practice video.
- Microphone: voice-note captures and teleprompter practice video.
- Photos: only if the reviewer picks an existing image of a card.

No location, no tracking, no ads.

## Backend

The native shell talks to https://ambassadorcompanion.netlify.app
(Netlify Functions). The in-app web content is bundled; API calls are HTTPS.
