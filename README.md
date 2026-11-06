# Lumen booking sync

A working demo of a service that keeps GoHighLevel in step with a clinic's EHR. When a new-patient consultation is booked in OptiMantra, the right lead in GoHighLevel moves to "Consult Booked" and the follow-up texts stop.

**Try it:** https://ehr-ghl-sync-demo.vercel.app

Lumen Acupuncture, its Lakeside and Northfield locations, and every patient here are fictional. This demo uses a pretend GoHighLevel account. It is not ready for real patient data until the [HIPAA checklist](#hipaa-checklist-before-real-patient-data) is done.

## What it does

OptiMantra stays the only official calendar. Nobody books in GoHighLevel, and this service never writes to OptiMantra. It listens for appointment events and does the following in GoHighLevel:

- Finds the right person and their existing lead, instead of creating duplicates.
- Moves that lead to "Consult Booked" in the pipeline it's already in. A paid ad lead stays in the paid pipeline, so your ad agency's numbers stay true.
- Stops follow-up texts, so nobody gets "ready to book?" the day after booking.
- Moves cancellations to "Consult Cancelled" and starts a short re-book sequence. You can switch this off per location.
- Updates the time on reschedules and leaves the stage alone.
- Ignores treatment appointments for existing patients. GoHighLevel isn't contacted at all.
- Removes clinical notes, diagnosis and card details on arrival, before anything is stored or sent.
- Writes every event to a ledger, so you can see what happened and why.

When it isn't sure who someone is, it flags the booking for a person. It never merges contacts and it never guesses.

## The ten scenarios

Each button on the demo page sends a webhook through the real sync code and shows GoHighLevel before and after, plus the ledger row.

| Scenario | What you should see |
|---|---|
| Organic lead books | Existing lead moves to Consult Booked, nurture texts stop |
| Paid ad lead books | Stays in the paid pipeline, campaign and UTM details don't change |
| Same webhook arrives twice | The second one changes nothing and is logged as a duplicate |
| New email, same phone | Phone finds the right person, no duplicate, stored email untouched |
| Patient reschedules | Time updates, stage stays |
| Patient cancels | Moves to Consult Cancelled, re-book sequence starts |
| Existing patient books a treatment | Ignored, GoHighLevel isn't contacted |
| Unknown person books a consult | New contact and organic opportunity, source "direct booking" |
| Unclear match | Flagged for review, nothing merged or created |
| Notes and card data in the payload | Stripped first, only the field names are logged |

## What's assumed and what's verified

| Topic | Status | Detail |
|---|---|---|
| HighLevel API endpoints, bodies, token types | **Verified against published docs** | Read from HighLevel's reference on 6 Nov 2026. See [API reference](#highlevel-api-reference). Not yet run against a live account. |
| OptiMantra has outbound webhooks | **Verified** | [Integrations page](https://www.optimantra.com/integrations) and [FAQ](https://www.optimantra.com/faq) |
| Webhook setup, PUT default, field selection | **Verified, OptiMantra's own guide** | [2026 EMR-to-CRM guide](https://www.optimantra.com/blog/connecting-emrs-to-crms-a-2026-guide-for-modern-healthcare-practices) |
| The `apptDate` field and its long date format | **Third-party source only** | [Nexamed tutorial](https://www.nexamed.us/post/how-to-integrate-optimantra-webhooks-with-your-crm-for-automated-follow-up) |
| Every other OptiMantra field name | **Assumed** | The schema isn't public. All of it lives in one small file, [`src/lib/sync/optimantra-adapter.ts`](src/lib/sync/optimantra-adapter.ts), replaced once a real webhook is captured. |
| That cancellations and reschedules send webhooks | **Assumed** | The only trigger named publicly is "When an Appointment is Booked". If the others don't exist, this has to be solved another way, so it's the first thing to confirm. |
| Webhook signing | **Not offered, as far as public docs show** | The setup form lists URL, type, source and trigger only. So the webhook address contains a long random secret, and an IP allowlist can be added once OptiMantra confirms its addresses. Ask them whether signing exists. |
| Webhook retries | **Unknown** | No public statement. If a delivery fails, the ledger shows a "failed" row and a repeat delivery finishes the job safely. If OptiMantra doesn't retry, someone needs to act on those rows. |

### Things to decide or confirm during discovery

1. **"Direct booking" on new opportunities.** HighLevel's published API doesn't let you set `source` when creating an opportunity, in any version. So the demo stores "direct booking" in a custom field called `booking_source`, and in the contact's own `source`. Those custom fields, plus `consult_time`, need creating in each sub-account. Test on a real account whether `source` can be set another way.
2. **A paid lead that went cold.** The brief only looks for *open* opportunities. A paid lead marked lost who books later gets a new organic opportunity, which credits the booking to organic. You and the ad agency should decide what you want there.
3. **Flagged bookings keep getting nurture texts** until someone resolves them, because the contact isn't certain. The demo logs them but has no screen to resolve them. A real build needs one, plus a notification.
4. **Removing contacts from the agency's workflows.** A booking removes the contact from paid nurture workflows too. Agree on the workflow list with the agency.
5. **OptiMantra's own HighLevel connection.** Their [integrations page](https://www.optimantra.com/integrations) describes one. Ask what it already covers before building around it.
6. **A cancelled appointment reopened with the same id** is treated as a replay and ignored. That's only a problem if OptiMantra reuses ids.

### Where the demo goes a little beyond the brief

These are small additions for cases the brief didn't cover. Tell me if you'd rather change any.

- **Reschedules.** The duplicate check uses appointment id, event type and, for reschedules only, the new time. Otherwise a patient's second reschedule would look like a repeat of the first.
- **More cases go to review:** a phone that matches someone with a different first name (usually a relative sharing a phone), a phone and email pointing at different people, two open opportunities, an unmapped appointment type, and a cancellation after staff already moved the lead on.
- **A booking that only shows a new time** is treated as a reschedule, in case OptiMantra has no separate reschedule event.
- **An old appointment cancelled after a new one was booked** leaves the lead at Consult Booked.

## HIPAA checklist before real patient data

This is a technical checklist, not legal advice. Have your compliance adviser confirm it. Sources were read on 6 Nov 2026, and vendor terms change.

Even a stripped-down record counts. A name plus "booked a consult at an acupuncture clinic" is protected health information, so everything below applies even with notes and card data removed.

### GoHighLevel

- [ ] **Buy the HIPAA add-on and sign the BAA.** HighLevel accounts [are not HIPAA compliant by default](https://help.gohighlevel.com/support/solutions/articles/48000983084-hipaa-compliance-with-highlevel). The add-on is [US$297 a month or $2,970 a year](https://www.gohighlevel.com/hipaa-webinar), bought at agency level under Settings, Compliance.
- [ ] **Read the terms first, because it's permanent.** HighLevel says the package [can't be cancelled, refunded or downgraded](https://help.gohighlevel.com/support/solutions/articles/48000983084-hipaa-compliance-with-highlevel). A separate page says that if it lapses, your [BAA may automatically expire](https://help.gohighlevel.com/support/solutions/articles/155000006344-highlevel-platform-updates-what-s-changed). Work out who owns the agency account and who pays, because a lapse would leave you without a BAA.
- [ ] **Turn HIPAA on for each sub-account and check it worked.** ⚠️ **HighLevel's sources disagree.** The help article's steps say to enable each sub-account by hand, and that this can't be undone. The same article and a [changelog entry](https://ideas.gohighlevel.com/changelog/editable-baas-automatic-hipaa-compliance) say it's automatic once the BAA is signed. Check the toggle yourself under Sub-Accounts, Advanced Settings.
- [ ] **Decide who sees what.** Your ad agency works in the same sub-account, so "Consult Booked" and patient names are visible to them. Ask your adviser whether they need a BAA with you, and limit their permissions.
- [ ] **Keep patient files out of media uploads for now.** A user report on HighLevel's [ideas board](https://ideas.gohighlevel.com/hipaa-compliance) says uploaded media can be opened without logging in, even with HIPAA on. It's unconfirmed and marked under review.

### LC Phone, Voice AI and Conversation AI

**What HighLevel states:** the [help article](https://help.gohighlevel.com/support/solutions/articles/48000983084-hipaa-compliance-with-highlevel) says covered data includes contacts, notes, custom fields, SMS/MMS, voice recordings, email, forms, calendars and invoices.

**What's unclear:**

| Feature | What I found | Status |
|---|---|---|
| LC Phone | The article lists SMS/MMS and voice recordings but never names LC Phone. [Twilio is a sub-processor](https://www.gohighlevel.com/sub-processors). I found no statement that Twilio is under a BAA for this. | ⚠️ Unclear |
| Voice AI | Not mentioned in any HIPAA page I read. [Retell AI, Synthflow and Botpress](https://help.gohighlevel.com/support/solutions/articles/155000006344-highlevel-platform-updates-what-s-changed) power AI features, and [OpenAI is a listed sub-processor](https://www.gohighlevel.com/sub-processors). No HIPAA statement on any of them. | ⚠️ Unclear, assume not covered |
| Conversation AI | Same as Voice AI. | ⚠️ Unclear, assume not covered |
| LC Email | A search excerpt of [HighLevel's LC Email article](https://help.gohighlevel.com/support/solutions/articles/48001220605) says it's HIPAA compliant with a Mailgun BAA. I didn't read the full article. | Check |

- [ ] **Get written confirmation from HighLevel** that the BAA covers LC Phone, Voice AI and Conversation AI, including the AI vendors behind them.
- [ ] **Keep Voice AI and Conversation AI away from patient conversations** in this sub-account until you have that in writing.

### OptiMantra

- [ ] **Confirm your BAA is signed.** The [FAQ](https://www.optimantra.com/faq) says one comes with the license. The [published BAA](https://www.optimantra.com/business-associate-agreement) (revised 5 Aug 2026) is with **CerboOM, LLC**, not a company named OptiMantra, so make sure yours names the right party.
- [ ] **Ask about webhook terms.** The BAA doesn't mention webhooks. Once data leaves OptiMantra for a receiver you chose, that receiver is your responsibility. Ask whether they encrypt delivery, sign requests, retry failures, and publish source IP addresses.
- [ ] **Turn off fields you don't need at the source.** [OptiMantra's guide](https://www.optimantra.com/blog/connecting-emrs-to-crms-a-2026-guide-for-modern-healthcare-practices) notes many clinics send everything. Send less: this service strips extra fields, but it's better if they never leave.

### Where this service runs

The live demo runs on ordinary Vercel and Neon accounts with **no BAA in place**, which is fine for fictional data only. The service handles names, phones and appointment details, so it needs covering too.

- [ ] **Whoever builds and runs this signs a BAA with the clinic.** A developer with access to the data is a business associate.
- [ ] **Vercel:** [Pro teams can buy a HIPAA BAA add-on](https://vercel.com/docs/security/compliance) for [$350 a month](https://vercel.com/docs/plans/pro-plan), or use Enterprise. [Secure Compute](https://vercel.com/docs/security/compliance) is optional and Enterprise-only.
- [ ] **Neon:** [HIPAA needs the Scale plan](https://neon.com/docs/security/hipaa), and the BAA is with Databricks, Neon's parent company. It's enabled per project and can't be turned off. It's free today, with a 15% surcharge planned. The [Data API isn't covered](https://neon.com/guides/hipaa-compliant-applications); this service doesn't use it.
- [ ] **Create the production database directly in Neon, or confirm with Neon and Vercel first.** No page I read says a database created through Vercel's Marketplace qualifies.
- [ ] **Or pick a HIPAA-eligible alternative,** such as AWS under its BAA. It's a small service and moves easily. I haven't priced this option.

### Minimum necessary data

- [ ] **Keep the allowlist short.** Only name, phone, email, appointment type, time, location and status pass through. Anything else is dropped by default, even a field added to OptiMantra later.
- [ ] **Keep treatment details out of GoHighLevel.** Treatment appointments are never sent. Consults reach GoHighLevel as a stage and a time, with no appointment type name, which matters if a type name could hint at a condition.
- [ ] **Keep clinical content out of text templates** in the follow-up and re-book sequences. Confirm you have consent to text.
- [ ] **Set a retention period for the ledger.** It holds no names, phones or emails, but appointment ids and times still count as patient data. The demo deletes simulator rows after a day and has no rule for real rows.
- [ ] **Rotate the webhook secret and HighLevel tokens** on a schedule and when staff leave. The secret is part of a URL, so keep URLs out of shared logs and screenshots.

### Protecting the Chicago location's phone setup

- [ ] **Give the new location its own sub-account and its own LC Phone number.** That leaves the Chicago location's existing Twilio and A2P setup alone: no shared number, no changed registration, no moved messaging.
- [ ] **Don't enable HIPAA on the Chicago sub-account until you've checked the effect.** The toggle can't be undone, and HighLevel's article also says the package "applies to all location accounts", so ask how it interacts with a sub-account on its own Twilio connection.
- [ ] **Confirm the new number's A2P registration** with HighLevel before launch. I didn't verify the exact steps for adding an LC Phone number alongside an existing Twilio sub-account.

In the demo, each location already maps to its own sub-account, token, pipelines and workflows, so this needs no code change.

## How it's built

For whoever maintains this.

- Next.js and TypeScript on Vercel, Postgres on Neon for the ledger.
- `src/lib/sync/optimantra-adapter.ts` is the only file that knows OptiMantra's format.
- `src/lib/sync/config.ts` holds locations, pipelines, stages, workflows, appointment types and the re-book switch.
- `src/lib/sync/engine.ts` holds the rules. `match.ts` does contact matching.
- `src/lib/ghl/http.ts` is the real client. `src/lib/ghl/mock.ts` has the same interface and refuses any request field HighLevel's schemas don't list.
- The webhook route is `/api/webhooks/optimantra/<secret>`, accepting PUT and POST. It uses the mock by default. Set `GHL_MODE=live` and one token per location to use the real client.
- Each event runs in one transaction with advisory locks on the appointment and the person, so simultaneous deliveries can't create duplicates. A failure rolls back the duplicate check, so a repeat delivery finishes the job.

### HighLevel API reference

Base URL `https://services.leadconnectorhq.com`. Each request sends `Authorization: Bearer <token>` and a `Version` header. Every endpoint here accepts an [OAuth access token or a Private Integration Token](https://marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken) for the sub-account. A single clinic only needs a Private Integration Token per sub-account, with the four scopes below.

The [docs index](https://marketplace.gohighlevel.com/docs/llms.txt) lists `v3` as the latest version, so that's the default. Set `GHL_API_VERSION` to pin an older one such as `2021-07-28`.

| Purpose | Endpoint | Scope |
|---|---|---|
| Find a contact | [`POST /contacts/search`](https://marketplace.gohighlevel.com/docs/ghl/contacts/search-contacts-advanced) | `contacts.readonly` |
| Create a contact | [`POST /contacts/upsert`](https://marketplace.gohighlevel.com/docs/ghl/contacts/upsert-contact) | `contacts.write` |
| Find opportunities | [`GET /opportunities/search`](https://marketplace.gohighlevel.com/docs/ghl/opportunities/search-opportunity) | `opportunities.readonly` |
| Create an opportunity | [`POST /opportunities/`](https://marketplace.gohighlevel.com/docs/ghl/opportunities/create-opportunity) | `opportunities.write` |
| Change stage or time | [`PUT /opportunities/{id}`](https://marketplace.gohighlevel.com/docs/ghl/opportunities/update-opportunity) | `opportunities.write` |
| Add or remove tags | [`POST`](https://marketplace.gohighlevel.com/docs/ghl/contacts/add-tags) and [`DELETE /contacts/{id}/tags`](https://marketplace.gohighlevel.com/docs/ghl/contacts/remove-tags) | `contacts.write` |
| Start a workflow | [`POST /contacts/{id}/workflow/{workflowId}`](https://marketplace.gohighlevel.com/docs/ghl/contacts/add-contact-to-workflow) | `contacts.write` |
| Stop a workflow | [`DELETE /contacts/{id}/workflow/{workflowId}`](https://marketplace.gohighlevel.com/docs/ghl/contacts/delete-contact-from-workflow) | `contacts.write` |

Notes from the docs:

- The update body has no `source`, UTM or campaign fields, and the client's type also excludes `pipelineId`. Attribution can't be changed by this code.
- The upsert docs warn that `tags` overwrites all tags, so tags only go through the tag endpoints.
- Search results [can take a few seconds](https://marketplace.gohighlevel.com/docs/ghl/contacts/search-contacts-advanced) to show recent changes, so new contacts go through upsert, which catches anything the search missed. Set "Allow Duplicate Contact" to off in each sub-account so upsert dedupes.
- Phones must already be stored in E.164 for an exact match. Older contacts in other formats won't match by phone, so check this on real data.
- Third-party guides cite a limit of 100 requests per 10 seconds, which I couldn't confirm in HighLevel's docs. The client backs off on a 429 either way.

### Running it

```bash
npm install
createdb ghl_sync_dev
DATABASE_URL=postgres://localhost:5432/ghl_sync_dev npm run db:migrate
DATABASE_URL=postgres://localhost:5432/ghl_sync_dev npm run dev

npm test                       # needs local Postgres; rebuilds ghl_sync_test
npm run build && npm run e2e   # needs a migrated ghl_sync_e2e database
```

---

Demo by [DC Tech](https://dctechltd.com)
