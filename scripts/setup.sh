#!/usr/bin/env bash
#
# Eve Chat Template — one-shot setup.
#
# Links the Vercel project, provisions Neon, sets every environment variable
# through the Vercel API, pulls them locally, and runs database migrations.
#
# It pauses once for you to paste your "Sign in with Vercel" OAuth app
# credentials — creating that app (and granting the email scope) is the only
# step that must be done in the Vercel dashboard.
#
# Requires: vercel CLI, node, pnpm, openssl. Run from the repo root:
#   ./scripts/setup.sh
#
set -euo pipefail

step() { printf '\n\033[1;36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m !\033[0m %s\n' "$1"; }
bold() { printf '\033[1m%s\033[0m\n' "$1"; }

# --- 0. Prerequisites -------------------------------------------------------
for cmd in vercel node pnpm openssl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required command: $cmd"; exit 1; }
done

NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Eve requires Node.js 24 or newer. You are running $(node -v). Please upgrade Node.js and try again."
  exit 1
fi

# --- 1. Dependencies --------------------------------------------------------
step "Installing dependencies"
pnpm install

# --- 2. Link the Vercel project --------------------------------------------
step "Linking Vercel project"
if [ ! -f .vercel/project.json ]; then
  vercel link
fi
PROJECT_ID=$(node -e 'console.log(require("./.vercel/project.json").projectId)')
TEAM_ID=$(node -e 'console.log(require("./.vercel/project.json").orgId)')

# json_field FIELD_PATH — read JSON from stdin and print a dotted field (or "").
json_field() {
  node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{const o=JSON.parse(s);console.log(process.argv[1].split(".").reduce((a,k)=>(a&&a[k]!=null)?a[k]:undefined,o)??"")}catch{console.log("")}})' "$1"
}

# Resolve human-friendly slugs from the API for dashboard URLs and prompts.
PROJECT_SLUG=$(vercel api "/v9/projects/$PROJECT_ID?teamId=$TEAM_ID" | json_field name)
TEAM_SLUG=$(vercel api "/v2/teams/$TEAM_ID" | json_field slug)
[ -n "$PROJECT_SLUG" ] && echo "  project: $PROJECT_SLUG${TEAM_SLUG:+  (team: $TEAM_SLUG)}"

# set_env KEY VALUE TYPE TARGETS_JSON
# Builds the JSON body with node (proper escaping) and upserts via the API,
# which writes to all listed targets — including all Preview branches — without
# the Git-branch prompt that blocks `vercel env add`.
set_env() {
  node -e 'const [k,v,t,tg]=process.argv.slice(1);process.stdout.write(JSON.stringify({key:k,value:v,type:t,target:JSON.parse(tg)}))' \
    "$1" "$2" "$3" "$4" \
    | vercel api "/v10/projects/$PROJECT_ID/env?upsert=true&teamId=$TEAM_ID" -X POST --input - >/dev/null
  echo "  set $1"
}

# --- 3. Provision Neon Postgres (required) ----------------------------------
step "Provisioning Neon Postgres"
if vercel env ls 2>/dev/null | grep -q 'DATABASE_URL'; then
  echo "  DATABASE_URL already present, skipping"
else
  vercel integration add neon --scope $TEAM_SLUG
fi

# --- 4. Better Auth secret --------------------------------------------------
step "Setting BETTER_AUTH_SECRET"
set_env BETTER_AUTH_SECRET "$(openssl rand -base64 32)" encrypted '["production","preview","development"]'

# --- 5. Sign in with Vercel OAuth app (manual) ------------------------------
step "Sign in with Vercel OAuth app"
APPS_URL="https://vercel.com/${TEAM_SLUG:-dashboard}/~/settings/apps"
CALLBACK_PATH="/api/auth/callback/vercel"
LOCAL_CALLBACK="http://localhost:3000$CALLBACK_PATH"

# ack INSTRUCTION — print a step, wait for the user to confirm, then mark it done.
ack() {
  printf '%b\n' "$1"
  read -r -p "     Press Enter when done... " _ </dev/tty
  printf '     \033[1;32m✓ done\033[0m\n\n'
}

echo "  Complete each step in the dashboard, confirming after each one:"
echo

ack "  1. Create the app — open $APPS_URL\n     (Settings -> Apps -> Create), choose a name, and Save."
ack "  2. Set the custom-domain callback URL (for local dev):\n     add $LOCAL_CALLBACK"
ack "  3. Link your project & set its callback URL:\n     select \"${PROJECT_SLUG:-your project}\" from the dropdown, then add path $CALLBACK_PATH"
ack "  4. Set the email scope — open Permissions and enable openid + email.\n     Without email, login fails with email_not_found."

CLIENT_SECRET=""
while [ -z "$CLIENT_SECRET" ]; do
  read -r -s -p "  5. Generate a client secret and paste it here: " CLIENT_SECRET </dev/tty; echo
done
printf '     \033[1;32m✓ done\033[0m\n\n'

CLIENT_ID=""
while [ -z "$CLIENT_ID" ]; do
  read -r -p "  6. Paste the client ID: " CLIENT_ID </dev/tty
done
printf '     \033[1;32m✓ done\033[0m\n'

set_env NEXT_PUBLIC_VERCEL_APP_CLIENT_ID "$CLIENT_ID" plain '["production","preview","development"]'
set_env VERCEL_APP_CLIENT_SECRET "$CLIENT_SECRET" encrypted '["production","preview","development"]'

# --- 6. Better Auth URL (production origin) ---------------------------------
step "Resolving production domain for BETTER_AUTH_URL"
DOMAIN=$(vercel api "/v9/projects/$PROJECT_ID/domains?teamId=$TEAM_ID" \
  | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const d=(JSON.parse(s).domains||[]);const m=d.find(x=>x.name.endsWith(".vercel.app"))||d[0];console.log(m?m.name:"")})')
if [ -n "$DOMAIN" ]; then
  set_env BETTER_AUTH_URL "https://$DOMAIN" plain '["production","preview"]'
  echo "  production domain: https://$DOMAIN"
else
  warn "Could not resolve a production domain. Set BETTER_AUTH_URL on Production/Preview manually."
fi

# --- 6b. Optional: Notion connector -----------------------------------------
step "Optional: Notion connector"
read -r -p "  Set up the Notion MCP connector now? [y/N] " SETUP_NOTION </dev/tty
case "${SETUP_NOTION:-n}" in
  [yY]*)
    echo "  Creating connector (a browser may open to authorize Notion)..."
    NOTION_JSON=$(vercel connect create mcp.notion.com --name notion --format json) || NOTION_JSON=""
    NOTION_UID=$(printf '%s' "$NOTION_JSON" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{const o=JSON.parse(s);const c=o.connector||o;console.log(c.uid||c.id||"")}catch{console.log("")}})')
    if [ -n "$NOTION_UID" ]; then
      echo "  connector: $NOTION_UID"
      vercel connect attach "$NOTION_UID" --yes >/dev/null \
        || warn "Could not attach the connector automatically; attach it from the dashboard if needed."
      set_env NOTION_CONNECTOR "$NOTION_UID" encrypted '["production","preview","development"]'
    else
      warn "Could not determine the connector UID. Create it manually and set NOTION_CONNECTOR (see docs/setup-and-deploy.md, step 6)."
    fi
    ;;
  *)
    echo "  Skipped. The app falls back to a connector named \"notion\" if NOTION_CONNECTOR is unset."
    ;;
esac

# --- 7. Pull environment variables locally ----------------------------------
step "Pulling environment variables to .env.local"
vercel env pull .env.local --yes
# BETTER_AUTH_URL is only set for Production/Preview; local dev uses localhost.
if ! grep -q '^BETTER_AUTH_URL=' .env.local 2>/dev/null; then
  echo 'BETTER_AUTH_URL=http://localhost:3000' >> .env.local
  echo "  added BETTER_AUTH_URL=http://localhost:3000 for local dev"
fi

# --- 8. Ensure DATABASE_URL is available locally for migrations -------------
if ! grep -q '^DATABASE_URL=' .env.local 2>/dev/null; then
  warn "DATABASE_URL is not in .env.local — Neon marks it sensitive and enables it"
  warn "for Production/Preview only, so it is not pulled. Enable it for the"
  warn "Development environment in the dashboard, or paste the Neon connection string."
  read -r -p "Paste DATABASE_URL (leave empty to skip migrations): " DBURL
  if [ -n "$DBURL" ]; then
    grep -v '^DATABASE_URL=' .env.local > .env.local.tmp 2>/dev/null || true
    mv -f .env.local.tmp .env.local 2>/dev/null || true
    echo "DATABASE_URL=$DBURL" >> .env.local
  fi
fi

# --- 9. Database migrations -------------------------------------------------
if grep -q '^DATABASE_URL=' .env.local 2>/dev/null; then
  step "Running database migrations"
  set -a; . ./.env.local; set +a
  pnpm db:migrate
else
  warn "Skipping migrations — DATABASE_URL missing. Run 'pnpm db:migrate' after setting it."
fi

# --- 10. Done ---------------------------------------------------------------
step "Setup complete"
bold "Start the app:  pnpm dev"
warn "If sign-in fails with email_not_found, grant the email scope on your OAuth app and retry."
