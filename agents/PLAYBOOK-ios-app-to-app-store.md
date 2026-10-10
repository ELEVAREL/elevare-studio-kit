# How the Elevare Studio app went from an idea to TestFlight, and how to do it again

Written 2026-09-30 by Fable for the owner's other Claude account. Everything below happened on this machine today or in the days before; nothing is a plan. Each section ends with the exact thing to repeat for a new app. Keys and passwords are never in this file: they live in the vault (`%USERPROFILE%\.keyvault\keyvault.ps1`, `list` prints names, `get NAME` prints one value, names are project-prefixed).

## 0. The shape of the thing

| Layer | What we used | Why |
|---|---|---|
| App | Expo SDK 57, expo-router, React Native, TypeScript, in `D:\elevare-app` | One codebase, native builds in the cloud, over-the-air JavaScript updates |
| Backend | Supabase project `<platform-project-ref>` (Postgres, Auth, Edge Functions), shared with the website | One account works in the app and on the web |
| AI | Anthropic, called only from the `ai-gateway` edge function with the vaulted key | The key never ships in a binary; consent, plan and spend are checked server-side |
| Money in the app | Apple in-app purchase (subscriptions + consumables) | Apple guideline 3.1.1 leaves no other option for digital goods |
| Money on the web | Square | Elevare's own card rail (the Stripe platform is closed) |
| Builds | EAS Build + EAS Submit (account `elevarestudiollc`), Starter plan | Cloud Macs; no Xcode on this Windows machine |
| Store | App Store Connect app id 6817706604, bundle `co.elevarestudio.app`, team 4732HMRHHU | |

## 1. Apple developer account

1. Enrol at developer.apple.com ($99 a year). It was enrolled as an Individual; the seller name on the store shows the person's name until it becomes an Organization.
2. To switch to an Organization you need a D-U-N-S number for the LLC. Filed with Dun & Bradstreet on 2026-09-30 (case 11049264) using the LLC's IRS EIN letter and the Connecticut Certificate of Organization (`D:\_business-documents\ELEVARESTUDIO-LLC\`). The two records disagree on address (IRS: Groton; CT filing: the registered agent in Hartford); the reply to D&B explains that in one sentence. You can keep uploading builds while this is pending; the switch carries the app across.
3. App Store Connect API key: Users and Access, Integrations, App Store Connect API, "Team keys", generate with Admin access, download the `.p8` once (ours: key id P6G8675N3P, issuer 120fb8c7-a3f4-4117-bad6-a1b142d0696b, file at `~/.keyvault/apple/AuthKey_P6G8675N3P.p8`). EAS uses the same key for submission; the API scripts use it for capabilities, certificates and profiles.
4. Push key (Apple Push Notifications, `.p8`): Certificates, Identifiers and Profiles, Keys, enable APNs, download once. Give it to EAS with `eas credentials` or upload in the Expo dashboard under Credentials.

Repeat for a new app: the account is the same; only the App ID, the ASC app record and the products are new.

## 2. The App ID and its capabilities (done through the API, not the website)

The website spins for minutes; the API answers in a second. Script pattern (`node`, ES256 JWT signed with the `.p8`, issuer and key id above; **set `iat` to now minus 120 seconds**: Apple rejects tokens whose issue time is ahead of its clock, and that shows up as a random `401 NOT_AUTHORIZED` on some endpoints and not others).

- `GET /v1/bundleIds?filter[identifier]=co.elevarestudio.app&include=bundleIdCapabilities`
- `POST /v1/bundleIdCapabilities` with `capabilityType` in `PUSH_NOTIFICATIONS`, `APP_GROUPS`, `ASSOCIATED_DOMAINS`, `SIRIKIT`, `IN_APP_PURCHASE`, `APPLE_ID_AUTH` (the name is `SIRIKIT`, not `SIRI`).
- App Groups themselves are not in the API: register `group.co.elevarestudio.app` on the developer website (Identifiers, App Groups) and attach it to each App ID that shares it (the app and its widget extension). Saving that invalidates the provisioning profiles; the next build regenerates them.

Repeat: same script, new bundle id.

## 3. The project settings that matter (`app.json`)

- `version` must equal the App Store Connect version string (ours 1.0.0); `runtimeVersion.policy: appVersion` means an over-the-air update reaches every build with that version, so a build that adds a native module must move the version or guard the module (see 8).
- `ios.bundleIdentifier`, `ios.appleTeamId`, `ios.usesAppleSignIn`, `ios.associatedDomains` (`applinks:` and `webcredentials:` for the site), `ios.entitlements["com.apple.security.application-groups"]`, `ios.infoPlist.NSSupportsLiveActivities`, `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` (this answers the export-compliance question so App Review never asks).
- Plugins: `expo-router`, `expo-apple-authentication`, `expo-notifications`, `expo-iap`, `@bacons/apple-targets` (widget + Live Activity extension from `targets/widget/`), and our own `./plugins/with-app-intents.js` (adds the Siri intents Swift file to the app target; take the project name from `config.modRequest.projectName`, never scan for an AppDelegate).
- `eas.json`: `appVersionSource: remote` (EAS keeps the build number), `build.production.node: "24.16.0"` (the lockfile was written by npm 11; the default image's npm 10 refused it), `credentialsSource: "local"` for iOS (see 5), `submit.production.ios.ascAppId` and `appleTeamId` so `--auto-submit` needs no prompt.

## 4. Building

```bash
npx eas build --platform ios --profile production --non-interactive --auto-submit --no-wait
```

**Run it from a detached worktree at the exact sha, never from a checkout anyone else is editing.** EAS uploads the working directory, not the commit, unless `eas.json` has `"cli": { "requireCommit": true }` (set it; when interactive mode then offers to commit everything, answer no). Print `git rev-parse HEAD` and a zero-line `git status --porcelain` right before the command, and remove the worktree after upload so no lane adopts it. elevare-app build 22 is TestFlight-only because it was cut from a dirty shared tree (2026-09-30; memory `eas-uploads-the-working-tree`).

Poll with `npx eas build:view <id>`; read the Xcode error summary with `--json` (`.error.message`). Every failure we hit and its fix:

| Failure | Fix |
|---|---|
| Profile lacks `aps-environment` / Push capability | Add the capability to the App ID (2), rebuild with `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`, `EXPO_APPLE_TEAM_TYPE=INDIVIDUAL` set so EAS can regenerate the profile |
| `npm ci` "Missing: typescript@5.9.3 from lock file" | Pin Node 24 in `eas.json` (npm version parity with the lockfile) |
| Prebuild "Could not locate a valid AppDelegate" | Our plugin scanned `ios/`; use `modRequest.projectName` |
| `containerBackground(_:for:)` only on iOS 17 | Widget extension `deploymentTarget: "17.0"` |
| `OpenURLIntent` only on iOS 18 | Intents `@available(iOS 18.0, *)` |
| Non-interactive EAS cannot create a profile for a NEW target (the widget) | Local signing (5) |
| `npm ci` ERESOLVE on EAS ("peer react@^19.3.0 from react-dom@19.3.0") while a local install passed | The lockfile pulled a newer `react-dom` than `react`; `npx expo install react-dom@<react version>` and commit the lockfile. EAS runs `npm ci`, which checks peers; a local `npm install` had not |
| `npm ci` on the EAS Mac fails in `node_modules/sharp` ("Attempting to build from source via node-gyp") | The lockfile was written on Windows, so it holds no darwin-arm64 binary for `sharp`. Do not keep `sharp` (or any native-binary dev tool) in package.json; run one-off scripts with `npx -p sharp node script.mjs` |
| `winpty` / piped stdin do not make EAS interactive here | There is no interactive terminal available to the agent; do not try |

## 5. Signing without an interactive terminal (local credentials)

EAS-managed credentials need an interactive prompt the first time a new target appears. We moved to local signing entirely through the API:

1. `openssl genrsa 2048` and a CSR (`MSYS_NO_PATHCONV=1` on Git Bash, Windows-style paths for the key).
2. `POST /v1/certificates` type `IOS_DISTRIBUTION` with the CSR → certificate id B5F7VJ4BBC, saved as `.cer`; `openssl pkcs12 -export -legacy` into `elevare_dist.p12` (password generated, in the vault as `ELEVARE_APP_IOS_DIST_P12_PASSWORD`).
3. `POST /v1/profiles` type `IOS_APP_STORE` for each bundle id with that certificate (app N65Z2QNLK4, widget QX48F3T9XG), saved as `.mobileprovision`. All under `~/.keyvault/apple/`.
4. Before each build, write `credentials.json` into the repo, run the build, delete it. Shape: ONE target = flat `{ "ios": { "provisioningProfilePath", "distributionCertificate": { "path", "password" } } }`; several targets = keyed by XCODE TARGET NAME (not bundle id), or EAS says "Credentials are not defined in credentials.json". `credentials.json` and `credentials/` are gitignored.

Result: build 20 compiled and uploaded with zero prompts.

## 6. App Store Connect, everything we entered

- App record created by `eas submit` on first upload ("Elevare (c6ca9c)" because "Elevare" was taken; renamed to "Elevare Studio").
- Subscriptions: one group "Elevare"; six products `co.elevarestudio.app.<tier>.<period>` (Essentials $9.99 / $79.99, Boardroom $29.99 / $239.99, Boardroom Plus $79.99 / $639.99), 7-day free introductory offer on each monthly, en-US name and description, all 175 storefronts. Non-standard price points ($239.99, $639.99) are under "See Additional Prices".
- Consumables: `topup.assistant` $9.99, `pack.marketing` $19.99, `kit.brand` $49.99, `pack.legal` $9.99, `report.audit` $14.99, each with name, description and availability.
- App Information: subtitle, categories Business / Productivity, content rights "no third-party content", age rating (all No / None gives 4+, which was WRONG for us: the Terms require 18+, so the 2026-10-01 pre-submission audit set the override to 18+; match the age rating to your own Terms), App Store Server Notifications production and sandbox both pointing at the `apple-notifications` edge function.
- App Privacy: policy URL, and the data types THIS BINARY collects (1.0 shipped seven: Name, Email, Phone Number, Other User Content, User ID, Purchase History, Product Interaction), each "App Functionality", linked, not tracking. **Derive the list from the build's code at its sha with its flags read, never from the fill sheet:** in one submission Device ID was nearly declared for push registration that sits behind `NOTIFICATIONS_LIVE = false`, Phone Number (the Store quote form's optional field) was missing until the audit, and `app.json`'s `NSPrivacyCollectedDataTypes` still lists only PurchaseHistory. One row per type: the `file:line` that collects it and the flag that gates it. The label has no API; Publish is a legal attestation.
- Pricing: Free, all regions; Mac and Vision Pro availability unticked.
- Version 1.0: promotional text, description, keywords, support and marketing URLs, copyright "2026 ELEVARESTUDIO LLC" (the filed entity spelling; the first entry, "Elevarestudio LLC", was corrected by the audit), manual release, sign-in required with the demo account, contact info, review notes. Every sentence was re-read against what the build actually does (the weekly notification sentence was removed because that build does not schedule it).
- UI quirks: custom dropdowns ignore programmatic value setting; click, ArrowDown, Return works. Text areas that already hold a value need the native setter plus an `input` event to register a change.

Repeat: the fill sheet at `D:\elevare-app\docs\store\ASC-FILL-SHEET.md` is the template; copy it for a new app and change the values.

## 7. What is in the app (the product decisions, in one paragraph each)

- **Tiers**: Free (3 questions a month, 50-cent cost cap) / Essentials / Boardroom / Boardroom Plus; the cap is a cost ceiling in cents per period, never shown as a question count (owner ruling). Annual saving shown as a computed percent.
- **Assistant**: first run asks the business name, website and location, runs a research pass on Elevare's server (public web only), shows "Is this right?" facts to confirm or correct, and only then advises. "I do not have a business yet" skips research. Consent screen names Anthropic and records the answer server-side; the gateway refuses without it.
- **Store**: "Made in the app" (IAP) and "Done by the Elevare team" (quote requests; services delivered outside the app, guideline 3.1.3(e)); the two never link to each other.
- **Notifications**: Expo push; Apple push key on EAS.
- **Widget, Live Activity, Siri**: `targets/widget` (WidgetKit + ActivityKit, iOS 17+), `modules/elevare-platform` (our Expo module writing the App Group and driving the activity), `plugins/ios/ElevareIntents.swift` ("Ask Elevare", iOS 18+). Universal links from elevarestudio.co (`/.well-known/apple-app-site-association` served as JSON).

## 8. The rule that keeps updates from crashing phones

Every native module is reached only through `src/lib/native.ts` with `requireOptionalNativeModule` (never `requireNativeModule`), so a JavaScript update that lands on an older binary gets a silent no-op instead of a crash. `npm run verify:native` proves it (it evaluates the file with substituted requires and includes a negative control). Keep it green.

## 9. The website as the same product

`app.elevarestudio.co` is served by the same Next.js build as the marketing site (`src/app/app/`, rewritten by `src/proxy.ts`), on the same Supabase project, so one sign-in works everywhere. The web version calls the same `ai-gateway` with the person's own token through `src/app/api/app/ai/route.ts`; subscriptions bought on the web (Square) and in the app (Apple) write the same `subscriptions` row, which is what both sides read. Foundation on branch `web-app/twin`; pages and Square checkout in flight.

## 10. Email for client sites

Resend Pro, one `mail.<client-domain>` per client (DKIM, SPF, DMARC on Vercel DNS), verified in minutes, sign-in emails moved too. Test sends go to Owner@elevarestudio.co only, never to a client or a customer.

## 11. Checklist to ship the next app (in order)

1. Bundle id, App ID capabilities via the API, App Group if it has a widget.
2. `app.json` per section 3; `eas.json` with Node pinned, `ascAppId`, `appleTeamId`.
3. First build with EAS-managed credentials if there is ONE target; local credentials (5) if there are extensions.
4. `eas build --auto-submit`; the first upload creates the ASC record; rename it.
5. Fill ASC from a copy of the fill sheet; products first (they must exist before the build that references them is reviewed).
6. Demo account for App Review (password in the vault, set on the auth user, verified with `crypt()`). **Its data is shown to Apple: seed it fictional, then read every row it can display (profile and business name, memberships, sample content) and grep them for the active clients' names.** Elevare's demo profile was named "ProCraft VA", a live client, until 29 seconds before submission (renamed 11:53:26Z, submitted 11:53:55Z, 2026-10-01); the pre-submission audit read the demo user's auth fields and not its profile, and the screenshot tool's client-name guard covered pixels, not the live account.
7. Privacy label (from the build's code, see section 6), age rating matching your Terms, pricing, version text, screenshots from a device or simulator capture of the real build (a web render with stand-in icons only under the conditions in PLAYBOOK §5, and it owes device recaptures with the next build; 1.0's set is that exception). When you correct a false sentence in the description, sweep the review notes and every other field for the same CLAIM, not the same string: 1.0 went to review with "Conversations stay on the phone" still in the notes after "Your conversations stay on your phone" was fixed in the description.
8. Submit. First-time subscriptions cannot go in through the API or the version page: press "Add for Review" on the subscription group page, each subscription page and each IAP page into one draft, add the version last (API `reviewSubmissionItems` with `appStoreVersion`), then PATCH `submitted=true`. The privacy label publishes with the submission.

## 12. What the Helios run (2026-09-30) added

- **The ASC API cannot create an app record.** `eas submit` creates it, but only in its interactive Apple-ID flow (password + 2FA on the owner's phone); the API key alone is not enough, and non-interactive submit stops with "Set ascAppId". A pseudo-terminal (node-pty) reaches the password prompt but the 2FA code still needs the owner, so the shortest path is: the owner runs `npx eas submit --platform ios --profile production --id <buildId>` in his own terminal once. Then put `ascAppId` in eas.json and never prompt again.
- **Everything after the record exists is API-able**, and the browser is not needed: appInfoLocalizations (name, subtitle, privacyPolicyUrl), appInfos primaryCategory, ageRatingDeclaration (2025 set: `advertising`, `healthOrWellnessTopics`, `lootBox`, `messagingAndChat`, `parentalControls`, `ageAssurance`, `socialMedia`, `socialMediaAgeRestricted`, `gunsOrOtherWeapons` are REQUIRED now; the declaration is read through `/v1/appInfos/{id}/ageRatingDeclaration`, never by its own id), appStoreVersions (versionString, copyright, releaseType), appStoreVersionLocalizations, appStoreReviewDetails (contact + demo account + password), appPriceSchedules (free point from `/v1/apps/{id}/appPricePoints?filter[territory]=USA`), builds (`usesNonExemptEncryption`), betaGroups/relationships/builds, betaBuildLocalizations (`whatsNew`), betaTesterInvitations. Script: `helios-fill.mjs` pattern in the session scratchpad; rebuild it from this list.
- The ASC version EAS creates is "1.0", not "1.0.0"; PATCH `versionString` to match app.json.
- An app name that is taken returns 409 on the PATCH; try alternates by API until one sticks (Helios -> "Helios by Elevare").
- App Review demo account: sign up through the public `/auth/v1/signup`, then `update auth.users set encrypted_password = crypt(..., gen_salt('bf')), email_confirmed_at = now()`, prove with a password-grant token call (HTTP 200), vault the password. The vault's `set` uses Read-Host, so feed it through node-pty, never a pipe.
- Do not submit an account-only build for App Review (guideline 4.2). TestFlight is the finish line until the app does something.
- **Parallel lanes on one Windows disk: never let more than one `npm ci` run at a time.** Five concurrent installs (main checkout + 4 worktrees) took >30 min each, one was killed mid-write and left `node_modules` half-written (`tsc is not recognized`, `Invalid package config`), and a later `rm -rf` hit locked directories. Lanes that only need typecheck/tests should install in WSL (`~/.helios-node`, ~16 s per tree) and run there; only the checkout that runs `eas build` needs a Windows install.

## 13. Build from WSL when the Windows disk is busy (proven 2026-09-30, EAS build 6 of Helios)

`git archive` the commit to a tar, extract in WSL Ubuntu, `git init && git add -A && git commit` (EAS wants a git repo to pick files), `npm ci` with the private Node (`~/.helios-node/node-v24.16.0-linux-x64/bin`, ~20 s), `npm run verify`, copy `~/.expo/state.json` from Windows into WSL `~/.expo/` (that is the EAS login), copy the `.mobileprovision` and `.p12` into `creds/` inside the tree, write `credentials.json` with those relative paths, then `EAS_SKIP_AUTO_FINGERPRINT=1 npx --yes eas-cli@latest build --platform ios --profile production --non-interactive --auto-submit --no-wait`. Delete `credentials.json` and `creds/` after. Never pipe the p12 password through the console; read it from the vault into a temp file and delete it.
- **WeatherKit needs two ticks on the App ID page:** Capabilities tab AND App Services tab (both website only). With one, the REST API returns `401 NOT_ENABLED` even though a first call may succeed once. Each save invalidates the profile; regenerate it by API.
