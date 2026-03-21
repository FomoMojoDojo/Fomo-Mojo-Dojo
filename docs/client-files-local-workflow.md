# Client Files: Storage + Local Folder Workflow

## Where uploaded files go now

When you upload in the app, files are stored in:

- Supabase Storage bucket: `input-files`
- Object path format: `<user_id>/<company>/<input_key>/<input_id>/<timestamp>-<filename>`
- Metadata row: `public.input_files` (`input_id`, `file_name`, `file_type`, `file_path`, tags)

That storage path is why files are company/input scoped inside the app.

## Recommended local folder structure

Use one local folder per company and place files in business-context folders:

```text
Client_Files/
  Edgewood/
    Foundation/
      Mental Health Providers/
        Competitive Alternatives/
    Execution/
      Storytelling/
        Brand Narrative/
```

You can add subfolders under each input area folder.
The sync script still supports the old `<input_key>/...` format for backward compatibility.

## Batch sync local files into the app

Script:

- `scripts/sync-local-files-to-supabase.mjs`

Commands:

```sh
# Dry run (shows what will upload/link)
node scripts/sync-local-files-to-supabase.mjs --company "Edgewood" --root "Client_Files/Edgewood"

# Apply
node scripts/sync-local-files-to-supabase.mjs --company "Edgewood" --root "Client_Files/Edgewood" --apply
```

Credential options:

- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Or run local Supabase (`supabase start`): the script auto-detects URL + service key from `supabase status -o json`.

## Safety behavior

- Default is dry run.
- Files without a recognizable input area in their path are skipped.
- Existing linked paths are not duplicated.
- You can review output before running `--apply`.

## Pull uploaded files back to local folders

If files are uploaded through the web app, they are stored in Supabase first.
Use this to mirror them back into `Client_Files/<Company>/<group>/<sub-group>/<input-label>/...`:

```sh
# Dry run
npm run files:pull-local -- --company "Edgewood" --root "Client_Files/Edgewood"

# Apply
npm run files:pull-local -- --company "Edgewood" --root "Client_Files/Edgewood" --apply
```

## Automatic local mirroring (macOS)

Run this every few minutes in background:

```sh
npm run files:auto-mirror
```

To make it automatic on login/restart via LaunchAgent:

```sh
cp /Users/fomomojodojo/dev/happy-file-hugger-main/launchd/com.happyfilehugger.file-mirror.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.happyfilehugger.file-mirror.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.happyfilehugger.file-mirror.plist
```

Check logs:

```sh
tail -f /tmp/happy-file-hugger-file-mirror.stdout.log
tail -f /tmp/happy-file-hugger-file-mirror.stderr.log
```
