#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dump-prd-to-hml.sh — copia o banco de PRD para o HML.
#
#   PRD é READ-ONLY: pg_dump apenas LÊ, nunca escreve no PRD.
#   O restore (--restore) é DESTRUTIVO no HML (--clean dropa e recria) e exige
#   confirmação. Por padrão o script SÓ faz o dump (seguro).
#
# Requisitos: pg_dump e psql no PATH (client do Postgres — use a versão >= a do
# banco mais novo envolvido, ex: 17).
#
# Uso:
#   export PRD_DATABASE_URL="postgres://user:senha@host_prd:5432/banco"
#   export HML_DATABASE_URL="postgres://user:senha@host_hml:5432/breaker_hml"
#   ./dump-prd-to-hml.sh                 # só DUMP do PRD (seguro)
#   ./dump-prd-to-hml.sh --restore       # DUMP + restaura no HML (pede confirmação)
#   ./dump-prd-to-hml.sh --restore --yes # sem pergunta (CI)
#
# Opcional: OUT_DIR (default ~/Documents/DB_backups)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PRD_DATABASE_URL="${PRD_DATABASE_URL:-}"
HML_DATABASE_URL="${HML_DATABASE_URL:-}"
OUT_DIR="${OUT_DIR:-$HOME/Documents/DB_backups}"
DO_RESTORE=false
ASSUME_YES=false

for a in "$@"; do
  case "$a" in
    --restore) DO_RESTORE=true ;;
    --yes|-y)  ASSUME_YES=true ;;
    *) echo "arg desconhecido: $a" >&2; exit 2 ;;
  esac
done

mask() { echo "$1" | sed -E 's#//[^@]*@#//***:***@#'; }

if [[ -z "$PRD_DATABASE_URL" ]]; then echo "ERRO: defina PRD_DATABASE_URL" >&2; exit 2; fi

mkdir -p "$OUT_DIR"
TS="$(date +%d_%m_%Y_%H_%M)"
DUMP_FILE="$OUT_DIR/prd_dump_${TS}.sql"

echo "==> DUMP do PRD (READ-ONLY): $(mask "$PRD_DATABASE_URL")"
echo "    arquivo: $DUMP_FILE"
# Dump plain (sem --clean): o HML é resetado abaixo antes de restaurar, evitando
# conflito com as FKs cross-ORM (núcleo Drizzle -> Client) que o app já criou.
pg_dump "$PRD_DATABASE_URL" --no-owner --no-acl --file="$DUMP_FILE"
echo "    OK ($(du -h "$DUMP_FILE" | cut -f1))"

if [[ "$DO_RESTORE" != true ]]; then
  echo "==> Só dump (seguro). Para restaurar no HML rode: $0 --restore"
  exit 0
fi

if [[ -z "$HML_DATABASE_URL" ]]; then echo "ERRO: defina HML_DATABASE_URL para --restore" >&2; exit 2; fi
if [[ "$HML_DATABASE_URL" == "$PRD_DATABASE_URL" ]]; then
  echo "ERRO: HML_DATABASE_URL == PRD_DATABASE_URL. ABORTADO (nunca restaurar no PRD)." >&2; exit 2
fi

echo ""
echo "!!! RESET + RESTORE no HML — isto APAGA TUDO no HML e carrega o PRD !!!"
echo "    alvo HML: $(mask "$HML_DATABASE_URL")"
if [[ "$ASSUME_YES" != true ]]; then
  read -r -p "Digite 'HML' para confirmar (apaga o schema do HML e restaura o PRD): " ans
  [[ "$ans" == "HML" ]] || { echo "abortado."; exit 1; }
fi

echo "==> Resetando o schema do HML (public + drizzle)"
psql "$HML_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;'

echo "==> RESTORE do PRD no HML"
psql "$HML_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DUMP_FILE"
echo "    OK"
echo ""
echo "==> Próximos passos:"
echo "    1) Reinicie o serviço app no EasyPanel (o migrate recria as tabelas do núcleo)."
echo "       Os clientes já aparecem no painel (vêm da tabela Client do PRD)."
echo "    2) (opcional, p/ F3/F4) no terminal do container:  cd server && npm run db:backfill"
