# Run Local

This is the quickest way to get the app running again on this machine.

## Start the app

From the project root:

```bash
cd /Users/fomomojodojo/Downloads/happy-file-hugger-main
npm run dev -- --host 0.0.0.0 --port 8080
```

Then open:

```text
http://127.0.0.1:8080/
```

Keep that terminal window open while you use the app.

## Start Supabase if needed

If the app is up but data, auth, or edge functions are failing, the local Supabase stack may not be running.

From the same project folder:

```bash
set -a
source supabase/functions/.env.local
set +a
supabase start
```

Useful local URLs:

- App: `http://127.0.0.1:8080/`
- Supabase Studio: `http://127.0.0.1:54323`
- Local auth email inbox: `http://127.0.0.1:54324`

For Tailscale access from another device, open:

- `http://YOUR-TAILSCALE-IP:8080/`
- or `http://YOUR-MAC-NAME:8080/` if MagicDNS is enabled

## Restart routine

If everything was shut down:

1. Open a terminal
2. Go to the project folder
3. Start Supabase if needed
4. Start the Vite app

Commands:

```bash
cd /Users/fomomojodojo/Downloads/happy-file-hugger-main
set -a
source supabase/functions/.env.local
set +a
supabase start
npm run dev -- --host 0.0.0.0 --port 8080
```

## Password reset

Password reset emails for the local app do not go to your real inbox.

They show up in the local mail catcher here:

```text
http://127.0.0.1:54324
```

Flow:

1. Click `Forgot password?` in the app
2. Submit your email
3. Open `http://127.0.0.1:54324`
4. Open the reset email
5. Follow the link back to `/reset-password`

## Common mistakes

### `npm` says it cannot find `package.json`

You are probably in the wrong directory.

Use:

```bash
cd /Users/fomomojodojo/Downloads/happy-file-hugger-main
```

### The app does not load

Check:

- the dev server terminal is still running
- you are opening `http://127.0.0.1:8080/`
- Supabase is running if the issue is data or auth related

If another device on Tailscale cannot connect:

- make sure the app is running on `0.0.0.0`, not `127.0.0.1`
- do not use `localhost` from the remote device
- use your Mac's Tailscale IP or machine name instead

### Password reset email never arrives

Check the local inbox:

```text
http://127.0.0.1:54324
```

## Start automatically after restart

This repo includes a LaunchAgent setup for macOS:

- script: `scripts/start-local-app.sh`
- plist template: `launchd/com.happyfilehugger.local-app.plist`

What it does:

- opens Terminal at login
- starts Docker Desktop if needed
- waits for Docker
- runs `supabase start`
- starts the Vite app on port `8080` for both local and Tailscale access

Why Terminal is involved:

- macOS can block background `launchd` jobs from reading repos inside `Downloads`
- opening Terminal at login is more reliable for a project stored there

Install it:

```bash
chmod +x /Users/fomomojodojo/Downloads/happy-file-hugger-main/scripts/start-local-app.sh
cp /Users/fomomojodojo/Downloads/happy-file-hugger-main/launchd/com.happyfilehugger.local-app.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.happyfilehugger.local-app.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.happyfilehugger.local-app.plist
```

After that, the app should start automatically when you log into the Mac.

Useful checks:

```bash
launchctl list | rg happyfilehugger
tail -f /tmp/happy-file-hugger-main.stdout.log
tail -f /tmp/happy-file-hugger-main.stderr.log
```

To disable it:

```bash
launchctl unload ~/Library/LaunchAgents/com.happyfilehugger.local-app.plist
rm ~/Library/LaunchAgents/com.happyfilehugger.local-app.plist
```
