# EAS iOS build with local credentials from the vault, from a clean detached worktree

**Harvested 2026-10-01** from `D:\elevare-app`, wave 6 part 2. Sources: commit `5d5b88a`
(`eas.json` production `ios.credentialsSource: "local"`, `.gitignore` for `credentials.json` and
`credentials/`), the conductor's build scripts for builds 21 and 23 (session scratchpad, not
committed), and commit `3c8a72e` (`cli.requireCommit: true`). The eas-cli behaviour below was read
from the installed **eas-cli 24.8.0** source on 2026-10-01 (`build/vcs/clients/git.js`,
`build/build/utils/repository.js`, `build/credentials/credentialsJson/read.js`).

## When to reach for it

- Non-interactive EAS cannot create the signing credential you need. The measured case: a new
  widget extension target. EAS non-interactive will not mint a provisioning profile for a new
  target, and an agent on this machine has no interactive TTY (winpty asserts; piped stdin reads as
  non-interactive). Builds failed at credential setup three times before signing moved local.
- Any build an agent cuts while other agents are writing the same checkout.
- Any build whose exact commit must be provable afterwards (a review build, a build the store
  screenshots must match).

## Two facts about eas-cli that decide the recipe

1. **Without `requireCommit`, eas-cli uploads the WORKING TREE, not your commit.** It clones with
   `--no-checkout` and then copies the working directory over the clone. In this wave a build was
   issued "from `cb50f80`" while other lanes began writing `src/` fifteen minutes into the CLI's
   `expo config` step; it would have shipped ungraded edits under that commit's label. It was
   stopped before upload. An earlier build was cut from a dirty tree and its contents cannot be
   proven equal to its commit.
2. **With `requireCommit: true`, a dirty tree stops the build, and the interactive path COMMITS
   EVERYTHING.** Dirty means `git status -s -uall` prints anything, so untracked files count and
   ignored files do not. Non-interactive: it lists the files and throws
   `Commit all changes. Aborting...`. Interactive: it asks `Commit changes to git?` and a yes runs
   `git add -A` and `git commit`. On a shared checkout that sweeps every other lane's work in
   progress into one commit, and **if `credentials.json` were not ignored it would commit the
   distribution certificate and its password.** Run builds non-interactive, and prove the ignore
   rule before writing the file.

`credentialsSource: "local"` is read on the CLIENT: eas-cli reads `credentials.json` from the
project dir, base64s the p12 and sends it with the job. It does not need to be in the archive, so
ignored credentials and `requireCommit: true` are compatible in principle. **Not yet proven by a
real build at harvest**: build 23 ran before `requireCommit` was added, and the first build with
both (build 24) had not been cut.

## The recipe

1. **Freeze the commit in a detached worktree.** `git worktree add --detach <dir> <sha>`, then
   junction `node_modules` from the main checkout (`mklink /J`) so nothing reinstalls. Confirm
   `node_modules`, `credentials.json` and `credentials/` are ignored there:
   `git -C <dir> check-ignore -v credentials.json credentials/dist.p12` must print a rule for each.
2. **Write the credentials inside `try`, delete them in `finally`.** Copy the p12 and the
   provisioning profiles from the vault folder into `<dir>/credentials/`, read the p12 password
   from the DPAPI vault under its project-prefixed name, and write `credentials.json` with one
   entry per target name:
   ```powershell
   $cert = @{ path = 'credentials/dist.p12'; password = "$pw" }
   $obj = @{ ios = @{
       <AppTarget>    = @{ provisioningProfilePath = 'credentials/app.mobileprovision';    distributionCertificate = $cert }
       <WidgetTarget> = @{ provisioningProfilePath = 'credentials/widgets.mobileprovision'; distributionCertificate = $cert }
   } }
   [IO.File]::WriteAllText($credJson, ($obj | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding $false))
   $null = Get-Content $credJson -Raw | ConvertFrom-Json   # parse it back before EAS does
   $pw = $null
   ```
   Write it without a BOM. Windows PowerShell 5.1's `Set-Content -Encoding utf8` prepends one; the
   build-21 script used it and the build-23 script replaced it (the reason is inferred, not logged).
   Throw if the vault returned nothing. Never echo the password.
3. **Prove the tree, then refuse a dirty one.** Print `HEAD` and the porcelain line count
   immediately before the build, and stop unless the count is 0 and `HEAD` is the sha you meant.
   The source script PRINTED the count and did not refuse on it; the refusal is this library's fix:
   ```powershell
   $head = git rev-parse HEAD; $dirty = @(git status --porcelain).Count
   Write-Output "HEAD=$head PORCELAIN_LINES=$dirty"
   if ($head -ne $expectedSha -or $dirty -ne 0) { throw "refusing to build: HEAD=$head dirty=$dirty" }
   ```
4. **Build non-interactive and redact the stream.**
   `npx eas build --platform ios --profile production --auto-submit --non-interactive --no-wait 2>&1 | ForEach-Object { $_ -replace 'password[^,}]*', 'password:[redacted]' }`,
   then `Write-Output "EAS_EXIT=$LASTEXITCODE"` (the native exit code survives the pipe in
   PowerShell; still print it on its own line).
5. **`finally` removes `credentials.json` and `credentials/` and prints whether each still
   exists.** Re-check with `ls` afterwards. Report the build id, the build number, the submission id,
   the printed `HEAD`, `PORCELAIN_LINES=0` and the cleanup line.

## Assumes / adapt

- `eas.json`: production `ios.credentialsSource: "local"`, `cli.requireCommit: true`,
  `appVersionSource: "remote"` with `autoIncrement` (the remote counter skips a number when an
  attempt is killed before upload; expect gaps).
- Pin Node in each build profile (`"node": "24.16.0"` here) to the version that wrote the lockfile,
  or `npm ci` on the builder can read the lock differently and fail.
- Credential material lives in the vault folder (`~/.keyvault/apple/`: the p12, its key, one
  `.mobileprovision` per target) with the password under a project-prefixed vault name
  (`<PROJECT>_IOS_DIST_P12_PASSWORD`). Search the vault for the exact name before calling it
  missing. Profiles carry every capability the targets use (an App Group shared by app and widget).
- **A new entitlement needs the App ID capability first.** Non-interactive EAS does not sync
  capabilities, so a build after adding, say, push notifications fails on a profile mismatch until
  the capability is enabled on the bundle id (App Store Connect API) and a new profile is minted.
  When EAS manages the profile, set `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID` and
  `EXPO_ASC_ISSUER_ID` on the same command. (From the session record, Tier 3.)
- Never commit the build script with a real path to a key or a vault name that reveals more than
  the project prefix. Keep it in the scratchpad or make every value a parameter.

## Related

[`store-screenshot-render-pipeline.md`](store-screenshot-render-pipeline.md) (render the frames from
the same detached worktree so they picture the binary), memory `check-the-vault-before-calling-a-key-missing`,
memory `deploy-identity`.
