# Git Backup Cheat Sheet

Use this when you want to save local work to GitHub quickly.

## Daily flow

```bash
cd /Users/fomomojodojo/dev/happy-file-hugger-main
git add -A
git commit -m "your message"
git push
```

## First-time remote setup (existing repo)

```bash
cd /Users/fomomojodojo/dev/happy-file-hugger-main
git remote set-url origin https://github.com/FomoMojoDojo/Fomo-Mojo-Dojo.git
git remote -v
git push -u origin main
```

If `origin` does not exist yet:

```bash
git remote add origin https://github.com/FomoMojoDojo/Fomo-Mojo-Dojo.git
git push -u origin main
```

## If you get 403 / no write access

Use a GitHub token (PAT), not your account password.

1. Create or update token access:
- repository access: `Only select repositories`
- select: `Fomo-Mojo-Dojo`
- permission: `Contents: Read and write`

2. Clear old cached credentials and retry:

```bash
printf "protocol=https\nhost=github.com\n" | git credential-osxkeychain erase
git push -u origin main
```

When prompted:
- Username: `FomoMojoDojo`
- Password: paste PAT token

## Useful checks

```bash
git status
git log --oneline -n 5
git remote -v
git branch --show-current
```
