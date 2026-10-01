# Event sources

Where Event Intelligence India gets its events, how each source is read, and why that's allowed.
Checked 1 October 2026: robots.txt and terms read for every source; recommended sources trial-read.

**Rules we follow (spec §58, §139):** official feeds and structured data first; robots.txt checked before every request; a site's requested crawl delay honoured; requests paced (at most one every 1.5 s per site); the bot identifies itself honestly (`EventIntelBot`). We never bypass CAPTCHAs, logins, paywalls, bot protection or rate limits, and never disguise the bot. If a site refuses the bot, it becomes a manual source.

Sources are switched on with the `SOURCES_ENABLED` setting on the API (Render → event-intel-api → Environment), as a comma-separated list of the ids below. Definitions live in `apps/api/src/ingestion/registry.ts`.

---

## Tier A — recommended for automatic sync

Trial run (fresh database, 1 Oct 2026): **145 events read → 48 imported, 1 duplicate merged**; 42 upcoming. Second run: 0 changed (idempotent).

| Id | Source | What it brings | How it's read | Why it's allowed |
|---|---|---|---|---|
| `india-expo-mart` | India Expo Centre & Mart, Greater Noida | Industrial and trade expos: India ITME, Battery Show, Renewable Energy Expo, PMEC, Industrial Connect, IFEX, India Manufacturing Show… (14 upcoming) | Public iCalendar feed | robots.txt allows all. Terms forbid commercial reuse; we keep facts + link for internal, non-commercial use. |
| `express-computer` | Express Computer (Indian Express B2B) | CIO "Technology Senate" events in Amritsar, Chandigarh, Hyderabad | Public iCalendar feed | Organizer's own feed; robots has no rules; no terms found. |
| `odoo-india` | Odoo events, India | Odoo academies and partner events (e.g. Manufacturing Academy, Chennai) | Event pages' schema.org data | robots allows the pages we read; no website terms on odoo.com/legal. |
| `zoho-events` | Zoho events platform | Zoho ERP/CRM/Payroll events and summits in Indian cities (+ online sessions) | Sitemap + schema.org data; non-India events dropped | robots allows all; no scraping clause in Zoho's terms. |
| `dev-events-india` | dev.events India page | Tech conferences: Black Hat India, Gartner IT Symposium, MongoDB.local, AWS Community Days, AVAR… | schema.org data on the page | robots allows all; no terms page. |
| `konfhub` | KonfHub (Indian ticketing) | Occasional tech community events (DevFest, BSides); most listings are sports/culture and are filtered out | Sitemap + schema.org data | robots + llms.txt explicitly allow crawling; terms forbid commercial resale only. |
| `confs-tech` | confs.tech | A few Indian developer/AI conferences | Open JSON on GitHub | MIT-licensed open data. |

## Tier B — possible, needs your decision

| Source | Value | Concern | What we'd need |
|---|---|---|---|
| Salesforce Trailblazer Community Groups (`trailblazer-india`) | ~20+ Indian Salesforce/CRM meetups a month | Site allows it (robots, Salesforce terms), but the platform it runs on (Bevy) forbids scraping in its terms | Your OK, ideally after asking Bevy/Salesforce |
| Google Developer Groups (`gdg-india`) | Dozens of AI/cloud community events a month | Same Bevy terms question | Same |
| Meetup groups (per-group calendar feeds) | SAP, Odoo, AWS, AI, security meetups in Indian cities | Feeds are allowed by robots; Meetup's own terms page couldn't be read | A list of groups you want to follow |
| Luma calendars (per-calendar feeds) | Bengaluru AI/startup scene | Allowed as a "supported interface" | A list of calendars you want to follow |
| Yashobhoomi (IICC, Delhi), BIEC (Bengaluru), NASSCOM | IMC, Bengaluru Tech Summit, IMTEX, NASSCOM events | No feed: needs a custom page reader per site (robots allow; no terms found) | Your OK + some build time; may break when they redesign |
| HITEX (Hyderabad) | Venue calendar with good structured data | Terms forbid use without written permission | Written permission from HITEX |

## Tier C — manual only ("Add by URL" or the team sheet)

These block bots, forbid automated reading in their terms, or have no usable calendar. Add their important events by pasting the official link (in the app from Phase 4) or as rows in the team sheet:

- **Vendors:** SAP (all SAP sites block bots: SAP NOW, TechEd, SAP Inside Track), Oracle/NetSuite, AWS (Summit India), ServiceNow (World Forum Mumbai), Microsoft (Reactor, AI Tour), Google Cloud, Salesforce World Tour, Infor.
- **Industry bodies and media:** FICCI (refuses our bot), CII (bot protection), ET portals — ETCIO, ETCISO, ET Manufacturing, ETHRWorld (terms forbid aggregation), DSCI, IAMAI, IMTMA/IMTEX, IEEMA/ELECRAMA, ACMA, UBS Forums, Quantic India, Bengaluru Tech Summit.
- **Venues and fair organisers:** Bharat Mandapam/ITPO, Chennai Trade Centre, Jio World Centre, NESCO/Bombay Exhibition Centre, Messe Frankfurt India, Messe München India, NürnbergMesse India, Informa Markets.
- **Platforms:** Eventbrite (terms forbid scraping), Hasgeek (terms forbid crawling), Townscript, AllEvents (terms not found).

## Tier D — not used

10times.com (bot protection), Trescon (blocked), Meetup API (paid), Google Calendar public feeds (robots disallow), PHDCCI (terms), Hyve (no India events), HICC / Biswa Bangla / Mahatma Mandir / PIECC / CODISSIA / Auto Cluster (no usable calendars), Epicor / Workday / conferenceindex / Devfolio / Unstop (not relevant).
**Blocklisted:** ktpo.in redirects to a gambling site.

## Team sheet (recommended)

A Google Sheet the team maintains, read every 12 hours like any other source, at the highest priority. Columns:

`title, start_date, end_date, start_time, end_time, city, venue, address, organizer, official_url, registration_url, event_type, topics, price, description, status`

Dates as `2026-11-12`, times as `09:30` (India time). Publish it with **File → Share → Publish to web → CSV** and put the link in the API's `CURATED_SHEET_URL` setting.
