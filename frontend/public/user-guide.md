# ASTRA user guide

ASTRA screens your satellites for close approaches with other objects, estimates the collision probability, plans avoidance manoeuvres and alerts your team. This guide covers every page, in the order you'll usually need them.

ASTRA supports decisions; it does not replace official conjunction assessment. Before you manoeuvre, confirm the event with a CDM from Space-Track (18th/19th Space Defense Squadrons), EU SST or a commercial provider, and coordinate with the other operator if their object is active.

## 1. Getting started

1. **Create your team.** Register with your name, email and company name. You become the team **owner**.
2. **Add your satellite.** Either open **Validation → Add satellites** and enter its NORAD number, or create a twin in **Spacecraft Builder** and then link it in **3D Visualiser → Orbit data**.
3. **Set its status to Operational** (Mission Control or 3D Visualiser). Only Launched and Operational satellites are screened automatically.
4. **Choose your alerts** on the **Alerts** page: email, Slack, minimum severity and how often to screen.
5. **Invite your colleagues** from the **Team** page.
6. **Turn on two-factor login** on the **Account** page (click your name, bottom left).

## 2. Teams and roles

Everything in ASTRA (satellites, missions, CDMs, ephemerides, validation results) belongs to your **team**. Everyone in the team sees the same fleet. Alerts are personal: each person picks their own channels and minimum severity, and every member with alerts on is notified.

| Role | Can do |
| --- | --- |
| Owner | Everything, including inviting admins and handing over ownership |
| Admin | Invite, change and remove engineers and viewers; team name; require two-factor login |
| Engineer | Add and change satellites, run screenings, upload CDMs and ephemerides, plan manoeuvres |
| Viewer | Read everything; set their own alerts |

**Inviting someone:** Team → *Invite a colleague* → email and role → *Create invitation*. If email is set up on the server, ASTRA emails the link; otherwise copy the link and send it yourself. The link works once and expires after 7 days.

**Joining:** open the link. New users create an account with the invited email. Existing users sign in and the invitation is accepted automatically. If you were the only member of your previous team, your satellites move with you.

**Removing someone:** Team → *Remove*. They lose access straight away and get an empty team of their own. Satellites stay with your team.

**Handing over:** the owner can *Make owner* another member; the previous owner becomes an admin. An owner must hand over before leaving.

## 3. Two-factor login

With two-factor login, signing in needs your password **and** a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy and others).

1. Account → *Set up two-factor login*.
2. Scan the QR code with the app (or type the key shown).
3. Enter the 6-digit code and click *Turn on*.
4. **Save the 10 recovery codes.** Each one lets you sign in once if you lose your phone.

Owners and admins can tick **Require two-factor login for everyone** on the Team page. Members without it are asked to set it up before they can continue.

Lost your phone *and* your recovery codes? Ask the server administrator to reset two-factor login for your account (Admin page), then set it up again.

## 4. Linking a real satellite

In **3D Visualiser**, select the twin and use **Orbit data**:

- **NORAD ID:** ASTRA fetches the latest public element set (TLE) from CelesTrak and refreshes it automatically.
- **Paste a TLE:** for satellites not yet in the public catalogue, or your own element sets.

A twin with no orbit linked uses an idealised circular "design orbit" from its configuration. That's useful for mission design, not for real conjunction screening.

## 5. Your own precise orbit (OEM)

Public TLEs are typically 1 km or more off, and the error grows each day. If you determine your own orbit (usually from GPS), upload it as a **CCSDS Orbit Ephemeris Message (OEM)** in **3D Visualiser → Operator ephemeris**. While the ephemeris covers the time, ASTRA uses it instead of the TLE for screening, collision probability and manoeuvre planning. Outside it, ASTRA falls back to the TLE.

| Supported | Values |
| --- | --- |
| Format | KVN (text) or XML, CCSDS 502.0-B |
| Reference frame | EME2000 / J2000, GCRF, ICRF, ITRF (any realisation), TEME |
| Time system | UTC, GPS, TAI, TT |
| Step | Up to 10 minutes between states (60 s recommended) |
| Covariance | Optional. RTN or inertial; used for collision probability |
| Size | Up to 50,000 states, about 11 MB |

After upload ASTRA shows how far the public TLE is from your ephemeris. A few km, mostly along-track, is normal. Hundreds of km usually means the wrong frame or time system in the file.

Without covariance in the file, ASTRA assumes 30 m radial, 100 m along-track and 30 m cross-track (1σ), which is typical for a GPS-based prediction a few days ahead. Include covariance if you have it.

A short example (KVN):

```
CCSDS_OEM_VERS = 2.0
CREATION_DATE = 2026-10-26T12:00:00
ORIGINATOR = YOUR-OPS
META_START
OBJECT_NAME = MYSAT-1
OBJECT_ID = 2026-001A
CENTER_NAME = EARTH
REF_FRAME = EME2000
TIME_SYSTEM = UTC
START_TIME = 2026-10-26T12:00:00
STOP_TIME = 2026-11-02T12:00:00
META_STOP
2026-10-26T12:00:00.000 -2345.678 5678.901 3210.123 -6.123 -1.234 3.456
2026-10-26T12:01:00.000 ...
```

## 6. Conjunction screening

**Conjunction** shows the close approaches for the selected satellite over the next 24 hours.

- ASTRA propagates every tracked object in your altitude band (SGP4 on CelesTrak data: active satellites plus the main debris clouds) every 30 seconds and refines each close approach to the exact time of closest approach (TCA).
- Anything that passes within 10 km is listed. Objects that stay within 5 km the whole time (for example docked modules) are listed separately and not counted.
- **Collision probability (Pc)** uses Foster's 2D method with a 15 m combined hard-body radius. Uncertainty comes from your ephemeris covariance or the TLE age.
- **Accuracy** on each event shows the combined 1σ position uncertainty: high (under 300 m), medium (under 1.5 km) or low.

| Severity | Rule (defaults) |
| --- | --- |
| Critical | Pc ≥ 1 in 10,000 (1e-4), or an emergency-reportable CDM |
| Warning | Pc ≥ 1 in 1,000,000 (1e-6), or miss distance under 1 km |
| Nominal | Everything else |

*Screen now & alert* runs a fresh screening and sends alerts for anything new or worse. *PDF report* produces a signed-off assessment you can file or send.

## 7. CDMs

A **Conjunction Data Message** is the official warning for a close approach.

- **From Space-Track:** when the server has a Space-Track account, ASTRA downloads the public CDMs for your Launched/Operational satellites every 8 hours.
- **Upload:** Conjunction → CDMs → choose a file or paste it. CCSDS KVN, XML or Space-Track JSON are accepted.

When a CDM includes covariance, ASTRA recalculates Pc with Foster's method and shows it next to the issuer's value. Upcoming CDMs appear at the top of the Conjunction events, marked **From CDM**, and count towards the Warning and Critical totals.

## 8. Planning an avoidance manoeuvre

Click **Plan avoidance** on a warning or critical event, or open the **Manoeuvre Planner** tab.

ASTRA evaluates dozens of options (along-track and radial burns at several lead times, and two-burn altitude changes), propagates each one with J2 and checks the new miss distance and Pc against the threat. The best options are then **re-screened against the whole catalogue**, so the recommended burn doesn't create a new close approach. Options over your ΔV budget are marked. The target is Pc below 1e-6 and miss distance at least 1 km.

Burns are modelled as impulsive. Check the recommended burn with your flight dynamics tools before you command it.

## 9. Alerts

On **Alerts**, choose email and/or Slack, the minimum severity (warning and critical, or critical only) and how often launched satellites are screened (1–24 hours). *Send test alert* checks your channels.

You get one alert per object per screening, and only when an event is new or its severity goes up. Satellites added for validation start with alerts off; turn them on per satellite on the Validation page.

## 10. Validation

**Validation** shows how closely ASTRA agrees with the official CDMs for your satellites. For each CDM, ASTRA makes its own prediction for the same pair of objects and records the differences in TCA, miss distance, Pc and severity. A run happens every day at 06:00 UTC, or click *Run validation now*. Download any run as CSV or PDF.

*Add starter set* tracks 20 well-known satellites (ISS, Hubble, Sentinels, Landsat and others) quietly, so you build up evidence quickly. Share totals from the report, not individual CDM rows: Space-Track's user agreement limits passing its data on to others.

## 11. Missions

**Mission Control** groups work into missions with a lifecycle: planning → active → completed (or aborted). Link a mission to a satellite to keep the context together.

## 12. Limits and accuracy

- Public TLEs are typically accurate to 1 km or more, and less with age. Use an operator ephemeris or CDM covariance for decisions.
- Only objects in the public catalogue are screened. Classified and untracked objects are not.
- Frame conversion (EME2000 → TEME) uses IAU-1976/1980 models, accurate to tens of metres.
- Manoeuvres are impulsive, with no finite-burn or attitude constraints.

## 13. Security

- Passwords are hashed with bcrypt. Sessions expire after 12 hours.
- Two-factor secrets are encrypted at rest (AES-256-GCM). Recovery codes are stored as hashes, and each works once.
- Every sign-in, change and upload is recorded in the audit log (Admin page).
- Each team sees only its own data.

## 14. Getting help

Questions, bugs or feature requests: contact the person who runs your ASTRA server. Include the satellite name, the time (UTC) and a screenshot.
