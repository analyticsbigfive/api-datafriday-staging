#!/bin/bash
# =============================================================
# test-data-integration.sh
# Tests E2E — Wizard Data Integration (Steps 1-5 + Aggregation)
# =============================================================
# Usage :
#   cd api-datafriday-staging
#   bash scripts/test-data-integration.sh
#
# Le script demande email + mot de passe (saisie masquée).
# Aucune variable sensible n'est loguée.
# =============================================================

set -euo pipefail

# ─── Config ────────────────────────────────────────────────
API="http://localhost:3000/api/v1"
ENV_FILE="envFiles/.env.development"
REPORT_FILE="/tmp/datafriday-test-$(date +%Y%m%d_%H%M%S).log"

# Couleurs
G='\033[0;32m'; R='\033[0;31m'; B='\033[0;34m'; Y='\033[1;33m'; NC='\033[0m'

# ─── Charger SUPABASE_URL + ANON_KEY depuis .env ou .env.development ──
if [ -f ".env" ]; then
  SUPABASE_URL=$(grep '^SUPABASE_URL=' .env | cut -d'=' -f2 | tr -d '"')
  ANON_KEY=$(grep '^SUPABASE_ANON_KEY=' .env | cut -d'=' -f2 | tr -d '"')
elif [ -f "$ENV_FILE" ]; then
  SUPABASE_URL=$(grep '^SUPABASE_URL=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"')
  ANON_KEY=$(grep '^SUPABASE_ANON_KEY=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"')
else
  echo -e "${R}❌ Fichier .env introuvable${NC}" && exit 1
fi

# ─── Compteurs ─────────────────────────────────────────────
PASS=0; FAIL=0; SKIP=0
declare -a FAILURES=()

# ─── Helpers ───────────────────────────────────────────────
log() { echo -e "$1" | tee -a "$REPORT_FILE"; }
header() { log "\n${Y}━━━━ $1 ━━━━${NC}"; }

assert_ok() {
  local label="$1" body="$2" check="${3:-}"
  if [ -n "$check" ] && ! echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); assert $check, 'check failed'" 2>/dev/null; then
    log "  ${R}✗ $label${NC}"
    FAIL=$((FAIL+1)); FAILURES+=("$label")
    return 1
  fi
  log "  ${G}✓ $label${NC}"
  PASS=$((PASS+1))
}

assert_status() {
  local label="$1" actual="$2" expected="${3:-200}"
  if [ "$actual" = "$expected" ]; then
    log "  ${G}✓ $label (HTTP $actual)${NC}"
    PASS=$((PASS+1))
  else
    log "  ${R}✗ $label — attendu HTTP $expected, reçu $actual${NC}"
    FAIL=$((FAIL+1)); FAILURES+=("$label")
    return 1
  fi
}

skip() { log "  ${Y}⊘ SKIP: $1${NC}"; SKIP=$((SKIP+1)); }

# ─── 0. Vérification API up ────────────────────────────────
header "0. HEALTH CHECK"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$API/health")
if [ "$HEALTH" != "200" ]; then
  log "${R}❌ API hors ligne (HTTP $HEALTH). Lancer: pnpm run start:dev${NC}"
  exit 1
fi
log "  ${G}✓ API en ligne (HTTP 200)${NC}"

# ─── 1. Auth ───────────────────────────────────────────────
header "1. AUTH — Supabase JWT"
echo -n "  Email : " && read EMAIL
echo -n "  Mot de passe : " && read -s PASSWORD && echo ""

LOGIN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
unset PASSWORD   # Effacer immédiatement

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  ERR=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('msg','?'))" 2>/dev/null)
  log "  ${R}✗ Login échoué: $ERR${NC}"
  log "  → Vérifier email/mot de passe sur https://app.supabase.com"
  exit 1
fi
log "  ${G}✓ Login OK — token obtenu (${#TOKEN} chars)${NC}"
AUTH="Authorization: Bearer $TOKEN"

# ─── 2. Me ─────────────────────────────────────────────────
header "2. ME"
ME=$(curl -s -H "$AUTH" "$API/me")
assert_ok "GET /me retourne un profil" "$ME" "'id' in d and 'email' in d"
TENANT_ID=$(echo "$ME" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tenantId',''))" 2>/dev/null)
log "  tenantId = $TENANT_ID"

# ─── 3. Spaces ─────────────────────────────────────────────
header "3. SPACES"
SPACES=$(curl -s -H "$AUTH" "$API/spaces")
SPACE_COUNT=$(echo "$SPACES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('data',d.get('items',[]))))" 2>/dev/null || echo "0")
assert_ok "GET /spaces retourne une liste" "$SPACES" "True"
log "  $SPACE_COUNT spaces trouvés"

SPACE_ID=$(echo "$SPACES" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d if isinstance(d,list) else d.get('data',d.get('items',[]))
print(items[0]['id'] if items else '')
" 2>/dev/null)

if [ -z "$SPACE_ID" ]; then
  log "  ${R}✗ Aucun space trouvé — arrêt des tests Aggregation${NC}"
  SPACE_AVAILABLE=0
else
  log "  Space ID utilisé : $SPACE_ID"
  SPACE_AVAILABLE=1
fi

# ─── 4. Weezevent Events (space) ───────────────────────────
header "4. WEEZEVENT EVENTS (espace enrichi)"
if [ "$SPACE_AVAILABLE" = "1" ]; then
  WZ_EVENTS=$(curl -s -H "$AUTH" "$API/spaces/$SPACE_ID/weezevent-events")
  WZ_COUNT=$(echo "$WZ_EVENTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")
  assert_ok "GET /spaces/:id/weezevent-events répond" "$WZ_EVENTS" "True"
  log "  $WZ_COUNT WeezeventEvents trouvés"

  # Récupérer integrationId depuis le premier WeezeventEvent
  INTEGRATION_ID=$(echo "$WZ_EVENTS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d if isinstance(d,list) else []
for ev in items:
  iid = ev.get('integrationId') or (ev.get('integration') or {}).get('id','')
  if iid: print(iid); break
else: print('')
" 2>/dev/null)
  log "  Integration ID : ${INTEGRATION_ID:-'non trouvé'}"
else
  skip "WeezeventEvents — aucun space disponible"
  INTEGRATION_ID=""
fi

# ─── 5. Aggregation — Step4 Context ────────────────────────
header "5. AGGREGATION — step4-context"
if [ "$SPACE_AVAILABLE" = "1" ]; then
  CTX_URL="$API/aggregation/step4-context/$SPACE_ID"
  [ -n "$INTEGRATION_ID" ] && CTX_URL="$CTX_URL?integrationId=$INTEGRATION_ID"
  CTX=$(curl -s -H "$AUTH" "$CTX_URL")
  CTX_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$CTX_URL")
  assert_status "GET /aggregation/step4-context HTTP" "$CTX_STATUS" "200"
  assert_ok "step4-context contient hasMappings" "$CTX" "'hasMappings' in d"
  assert_ok "step4-context contient weezeventEvents" "$CTX" "'weezeventEvents' in d"
  assert_ok "step4-context contient eventTypes" "$CTX" "'eventTypes' in d"
  HAS_MAP=$(echo "$CTX" | python3 -c "import sys,json; print(json.load(sys.stdin).get('hasMappings'))" 2>/dev/null)
  log "  hasMappings = $HAS_MAP"
else
  skip "step4-context — aucun space disponible"
fi

# ─── 6. Aggregation — events-timeline ──────────────────────
header "6. AGGREGATION — events-timeline"
if [ "$SPACE_AVAILABLE" = "1" ]; then
  TL_URL="$API/aggregation/events-timeline/$SPACE_ID"
  [ -n "$INTEGRATION_ID" ] && TL_URL="$TL_URL?integrationId=$INTEGRATION_ID"
  TL=$(curl -s -H "$AUTH" "$TL_URL")
  TL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$TL_URL")
  assert_status "GET /aggregation/events-timeline HTTP" "$TL_STATUS" "200"
  assert_ok "events-timeline contient events[]" "$TL" "'events' in d"
  assert_ok "events-timeline contient unregisteredDates[]" "$TL" "'unregisteredDates' in d"
  assert_ok "transactionStats non null (bug #5)" "$TL" "d.get('transactionStats') is not None"

  EVENT_COUNT=$(echo "$TL" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('events',[])))" 2>/dev/null || echo "0")
  UNREG_COUNT=$(echo "$TL" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('unregisteredDates',[])))" 2>/dev/null || echo "0")
  TX_STATS=$(echo "$TL" | python3 -c "import sys,json; ts=json.load(sys.stdin).get('transactionStats',{}); print(f\"total={ts.get('total',0)} matched={ts.get('matched',0)} unmatched={ts.get('unmatched',0)}\")" 2>/dev/null)
  log "  events couverts : $EVENT_COUNT | dates non couvertes : $UNREG_COUNT"
  log "  transactionStats : $TX_STATS"

  # Premier event avec status completed pour les sous-tests
  EVENT_ID=$(echo "$TL" | python3 -c "
import sys,json
evts=[e for e in json.load(sys.stdin).get('events',[]) if e.get('aggregationStatus')=='completed']
print(evts[0]['id'] if evts else '')
" 2>/dev/null)
  PENDING_ID=$(echo "$TL" | python3 -c "
import sys,json
evts=[e for e in json.load(sys.stdin).get('events',[]) if e.get('aggregationStatus') in ['pending','failed']]
print(evts[0]['id'] if evts else '')
" 2>/dev/null)
  log "  Event completed utilisé : ${EVENT_ID:-'aucun'}"
  log "  Event pending utilisé   : ${PENDING_ID:-'aucun'}"
else
  skip "events-timeline — aucun space disponible"
  EVENT_ID=""; PENDING_ID=""
fi

# ─── 7. event-stats ────────────────────────────────────────
header "7. AGGREGATION — event-stats"
if [ -n "$EVENT_ID" ]; then
  STATS=$(curl -s -H "$AUTH" "$API/aggregation/event-stats/$SPACE_ID/$EVENT_ID")
  STATS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/aggregation/event-stats/$SPACE_ID/$EVENT_ID")
  assert_status "GET /aggregation/event-stats HTTP" "$STATS_STATUS" "200"
  assert_ok "event-stats contient revenueHt" "$STATS" "'revenueHt' in d or 'revenue' in d"
  assert_ok "event-stats contient transactionsCount" "$STATS" "'transactionsCount' in d"
  REVENUE=$(echo "$STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('revenueHt',d.get('revenue','?')))" 2>/dev/null)
  log "  revenueHt = $REVENUE"
else
  skip "event-stats — aucun event completed"
fi

# ─── 8. event-breakdown ────────────────────────────────────
header "8. AGGREGATION — event-breakdown"
if [ -n "$EVENT_ID" ]; then
  BRK=$(curl -s -H "$AUTH" "$API/aggregation/event-breakdown/$SPACE_ID/$EVENT_ID")
  BRK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/aggregation/event-breakdown/$SPACE_ID/$EVENT_ID")
  assert_status "GET /aggregation/event-breakdown HTTP" "$BRK_STATUS" "200"
  assert_ok "event-breakdown contient byShop" "$BRK" "'byShop' in d"
  assert_ok "event-breakdown contient byProduct" "$BRK" "'byProduct' in d"
  SHOPS=$(echo "$BRK" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('byShop',[])))" 2>/dev/null || echo "?")
  log "  byShop entries : $SHOPS"
else
  skip "event-breakdown — aucun event completed"
fi

# ─── 9. event-minute-chart ─────────────────────────────────
header "9. AGGREGATION — event-minute-chart"
if [ -n "$EVENT_ID" ]; then
  CHART=$(curl -s -H "$AUTH" "$API/aggregation/event-minute-chart/$SPACE_ID/$EVENT_ID")
  CHART_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/aggregation/event-minute-chart/$SPACE_ID/$EVENT_ID")
  assert_status "GET /aggregation/event-minute-chart HTTP" "$CHART_STATUS" "200"
  assert_ok "event-minute-chart contient eventId" "$CHART" "'eventId' in d"
  assert_ok "event-minute-chart contient data[]" "$CHART" "'data' in d and isinstance(d['data'],list)"
  DATA_LEN=$(echo "$CHART" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null || echo "0")
  if [ "$DATA_LEN" = "0" ]; then
    log "  ${Y}⚠ data[] vide — event pas encore agrégé sur SpaceRevenueMinuteAgg${NC}"
  else
    log "  ${G}$DATA_LEN points de données (minutes)${NC}"
    # Vérifier structure d'un point
    assert_ok "data[0] contient minute + revenueHt + transactionsCount" "$CHART" "
d['data'] and all(k in d['data'][0] for k in ['minute','revenueHt','transactionsCount'])"
  fi
else
  skip "event-minute-chart — aucun event completed"
fi

# ─── 10. process-events + polling ──────────────────────────
header "10. AGGREGATION — process-events + polling"
if [ -n "$PENDING_ID" ] && [ -n "$INTEGRATION_ID" ]; then
  PROC=$(curl -s -X POST "$API/aggregation/process-events" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"spaceId\":\"$SPACE_ID\",\"eventIds\":[\"$PENDING_ID\"],\"integrationId\":\"$INTEGRATION_ID\"}")
  PROC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/aggregation/process-events" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"spaceId\":\"$SPACE_ID\",\"eventIds\":[\"$PENDING_ID\"],\"integrationId\":\"$INTEGRATION_ID\"}")
  assert_status "POST /aggregation/process-events HTTP" "$PROC_STATUS" "201"
  assert_ok "process-events retourne jobId" "$PROC" "'jobId' in d"

  JOB_ID=$(echo "$PROC" | python3 -c "import sys,json; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null)
  log "  jobId = $JOB_ID"

  if [ -n "$JOB_ID" ]; then
    log "  Polling /aggregation/progress/$JOB_ID (3 fois, intervalle 2s)..."
    for i in 1 2 3; do
      sleep 2
      PROG=$(curl -s -H "$AUTH" "$API/aggregation/progress/$JOB_ID")
      PROG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/aggregation/progress/$JOB_ID")
      JOB_STATUS=$(echo "$PROG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
      PROGRESS=$(echo "$PROG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('progress','?'))" 2>/dev/null)
      log "  poll $i — HTTP $PROG_STATUS | status=$JOB_STATUS | progress=$PROGRESS%"
      [ "$PROG_STATUS" = "200" ] && assert_ok "progress/$JOB_ID contient status" "$PROG" "'status' in d"
      [ "$JOB_STATUS" = "completed" ] && break
    done
  fi
else
  skip "process-events — aucun event pending ou integration ID manquant"
fi

# ─── 11. Mappings progress ─────────────────────────────────
header "11. MAPPINGS — progress"
PROG_ALL=$(curl -s -H "$AUTH" "$API/mappings/progress")
PROG_ALL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/mappings/progress")
assert_status "GET /mappings/progress HTTP" "$PROG_ALL_STATUS" "200"
assert_ok "progress est un array non vide" "$PROG_ALL" "isinstance(d,list) and len(d)>0"

if [ "$PROG_ALL_STATUS" = "200" ]; then
  FIRST=$(echo "$PROG_ALL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d[0],indent=2)) if d else print('{}')" 2>/dev/null)
  log "  Premier entrée :"
  echo "$FIRST" | sed 's/^/    /' | tee -a "$REPORT_FILE"
  
  # Vérifier que step1 et step2 ne sont plus toujours false (bug #14 corrigé)
  S1=$(echo "$PROG_ALL" | python3 -c "import sys,json; d=json.load(sys.stdin); vals=[x.get('step1_space_mapped',False) for x in d]; print('ok' if any(vals) else 'all_false')" 2>/dev/null)
  S2=$(echo "$PROG_ALL" | python3 -c "import sys,json; d=json.load(sys.stdin); vals=[x.get('step2_shops_mapped',False) for x in d]; print('ok' if any(vals) else 'all_false')" 2>/dev/null)
  
  if [ "$S1" = "all_false" ]; then
    log "  ${Y}⚠ step1_space_mapped toujours false — mapping step1 absent ou bug #14 non corrigé${NC}"
  else
    log "  ${G}✓ step1_space_mapped = true pour au moins une intégration${NC}"
  fi
  if [ "$S2" = "all_false" ]; then
    log "  ${Y}⚠ step2_shops_mapped toujours false — shops non mappés ou bug${NC}"
  else
    log "  ${G}✓ step2_shops_mapped = true pour au moins une intégration${NC}"
  fi
fi

if [ -n "$INTEGRATION_ID" ]; then
  PROG_ONE=$(curl -s -H "$AUTH" "$API/mappings/progress/$INTEGRATION_ID")
  PROG_ONE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/mappings/progress/$INTEGRATION_ID")
  assert_status "GET /mappings/progress/:id HTTP" "$PROG_ONE_STATUS" "200"
  log "  progress single : $(echo "$PROG_ONE" | python3 -c "import sys,json; d=json.load(sys.stdin); print({k:v for k,v in d.items() if k.startswith('step')})" 2>/dev/null)"
fi

# ─── 12. Dashboard ─────────────────────────────────────────
header "12. DASHBOARD"
if [ "$SPACE_AVAILABLE" = "1" ]; then
  FROM="2024-01-01T00:00:00Z"; TO="2026-12-31T23:59:59Z"
  DASH=$(curl -s -H "$AUTH" "$API/spaces/$SPACE_ID/dashboard?from=$FROM&to=$TO")
  DASH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/spaces/$SPACE_ID/dashboard?from=$FROM&to=$TO")
  assert_status "GET /spaces/:id/dashboard HTTP" "$DASH_STATUS" "200"
  assert_ok "dashboard contient kpis" "$DASH" "'kpis' in d or 'revenueHt' in d"

  REVENUE=$(echo "$DASH" | python3 -c "import sys,json; d=json.load(sys.stdin); kpis=d.get('kpis',d); print(kpis.get('revenueHt','?'))" 2>/dev/null)
  TX=$(echo "$DASH" | python3 -c "import sys,json; d=json.load(sys.stdin); kpis=d.get('kpis',d); print(kpis.get('transactionsCount','?'))" 2>/dev/null)
  log "  revenueHt=$REVENUE | transactionsCount=$TX"
  
  if [ "$REVENUE" = "0" ] || [ "$REVENUE" = "0.00" ] || [ "$REVENUE" = "?" ]; then
    log "  ${Y}⚠ revenueHt=0 — SpaceRevenueMinuteAgg peut-être vide. Lancer une sync d'abord.${NC}"
  fi
else
  skip "dashboard — aucun space disponible"
fi

# ─── 13. Weezevent raw ─────────────────────────────────────
header "13. WEEZEVENT — données brutes"
if [ -n "$INTEGRATION_ID" ]; then
  WZ_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/weezevent/events?integrationId=$INTEGRATION_ID")
  assert_status "GET /weezevent/events HTTP" "$WZ_STATUS" "200"

  LOC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/weezevent/locations?integrationId=$INTEGRATION_ID")
  assert_status "GET /weezevent/locations HTTP" "$LOC_STATUS" "200"

  SYNC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/weezevent/sync/status?integrationId=$INTEGRATION_ID")
  assert_status "GET /weezevent/sync/status HTTP" "$SYNC_STATUS" "200"

  TX_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/weezevent/transactions?integrationId=$INTEGRATION_ID&limit=5")
  assert_status "GET /weezevent/transactions HTTP" "$TX_STATUS" "200"

  TX_DATA=$(curl -s -H "$AUTH" "$API/weezevent/transactions?integrationId=$INTEGRATION_ID&limit=5")
  TX_COUNT=$(echo "$TX_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('data',[])))" 2>/dev/null || echo "0")
  log "  $TX_COUNT transactions (sample de 5)"
else
  skip "weezevent raw — integration ID non disponible"
fi

# ─── 14. Events DataFriday ─────────────────────────────────
header "14. EVENTS DATAFRIDAY"
if [ "$SPACE_AVAILABLE" = "1" ]; then
  EV_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/events?spaceId=$SPACE_ID")
  assert_status "GET /events?spaceId HTTP" "$EV_STATUS" "200"
  EV_DATA=$(curl -s -H "$AUTH" "$API/events?spaceId=$SPACE_ID")
  EV_COUNT=$(echo "$EV_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('data',[])))" 2>/dev/null || echo "0")
  log "  $EV_COUNT Events DataFriday pour ce space"
else
  skip "events — aucun space disponible"
fi

# ─── Rapport final ─────────────────────────────────────────
log ""
log "${Y}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "${B}RÉSULTATS${NC}"
log "${Y}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "  ${G}✓ PASS : $PASS${NC}"
log "  ${R}✗ FAIL : $FAIL${NC}"
log "  ${Y}⊘ SKIP : $SKIP${NC}"
log ""

if [ ${#FAILURES[@]} -gt 0 ]; then
  log "${R}Tests échoués :${NC}"
  for f in "${FAILURES[@]}"; do
    log "  ${R}• $f${NC}"
  done
  log ""
fi

log "Rapport complet : $REPORT_FILE"
log ""

[ "$FAIL" -gt 0 ] && exit 1 || exit 0
