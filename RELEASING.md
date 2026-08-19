# Releasing Screenlabel

The pipeline is automated; the Apple account setup is not. Do the one-time setup
once, then every release is a tag push.

## Why signing matters

macOS Gatekeeper blocks apps from unidentified developers. If you hand someone an
unsigned `.app`, they get a dialog saying it "cannot be opened because it is from
an unidentified developer," and most people stop there. Two separate things fix
this:

- **Signing** stamps the app with a certificate proving it came from you.
- **Notarization** uploads the signed app to Apple, which scans it for malware and
  issues a ticket. Gatekeeper checks for that ticket on first launch.

You need both. Signing without notarizing still triggers a warning on modern
macOS.

## One-time setup

### 1. Apple Developer Program — $99/year

Enroll at <https://developer.apple.com/programs/>. Enrollment can take a day or
two to clear. Nothing below works until it does.

### 2. Create a Developer ID Application certificate

In Xcode: **Settings → Accounts → your Apple ID → Manage Certificates → + →
Developer ID Application**. (Or create it in the Developer portal and download it.)

"Developer ID Application" is the right type — *not* "Mac App Distribution",
which is only for the App Store.

### 3. Export the certificate as a `.p12`

Open **Keychain Access**, find the certificate under **My Certificates**,
right-click → **Export**. Save as `.p12` and set a password you'll remember.

Then base64-encode it, since GitHub secrets hold text:

```bash
base64 -i certificate.p12 | pbcopy
```

### 4. Find your signing identity and team ID

```bash
security find-identity -v -p codesigning
```

Copy the full name, which looks like
`Developer ID Application: Nigel Purvis (ABCDE12345)`. The code in parentheses is
your team ID.

### 5. Create an app-specific password for notarization

At <https://appleid.apple.com> → **Sign-In and Security → App-Specific
Passwords → +**. Notarization will not accept your normal Apple ID password.

### 6. Add the GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | the base64 string from step 3 |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password from step 3 |
| `APPLE_SIGNING_IDENTITY` | the full identity string from step 4 |
| `APPLE_ID` | your Apple ID email |
| `APPLE_PASSWORD` | the app-specific password from step 5 |
| `APPLE_TEAM_ID` | the code in parentheses from step 4 |

## Cutting a release

1. Bump the version in **three** places so they agree — `package.json`,
   `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
2. Commit that.
3. Tag and push:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

The workflow typechecks, runs the tests, builds a universal binary (Apple Silicon
and Intel in one download), signs it, notarizes it, and attaches the `.dmg` to a
**draft** release.

4. Open the draft on GitHub, write the notes, and publish.

## Verifying before you publish

Download the `.dmg` from the draft and check it the way a stranger's Mac will:

```bash
spctl -a -vvv -t install /Volumes/Screenlabel/Screenlabel.app
```

`source=Notarized Developer ID` means it's good. Anything else means Gatekeeper
will complain.

Best test: open it on a Mac that has never had the project on it. Your own machine
trusts things a stranger's won't.

## If the notarization step fails

Ask Apple what it objected to:

```bash
xcrun notarytool log <submission-id> \
  --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_PASSWORD"
```

The usual causes are a wrong certificate type (Mac App Distribution instead of
Developer ID Application), a normal password where an app-specific one is
required, or a team ID that doesn't match the certificate.
