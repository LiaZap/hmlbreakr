<#
.SYNOPSIS
  Copia o banco de PRD para o HML. PRD = READ-ONLY (pg_dump só lê).

.DESCRIPTION
  Por padrão SÓ faz o dump do PRD (seguro). Com -Restore, restaura no HML —
  operação DESTRUTIVA no HML (--clean dropa e recria), com confirmação.

  Requisitos: pg_dump e psql no PATH (client do Postgres >= a versão do banco
  mais novo, ex: 17).

.EXAMPLE
  $env:PRD_DATABASE_URL = "postgres://user:senha@host_prd:5432/banco"
  $env:HML_DATABASE_URL = "postgres://user:senha@host_hml:5432/breaker_hml"
  .\dump-prd-to-hml.ps1                  # só DUMP (seguro)
  .\dump-prd-to-hml.ps1 -Restore         # DUMP + restore no HML (confirma)
  .\dump-prd-to-hml.ps1 -Restore -Yes    # sem pergunta
#>
param(
  [switch]$Restore,
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'

$prd = $env:PRD_DATABASE_URL
$hml = $env:HML_DATABASE_URL
$outDir = if ($env:OUT_DIR) { $env:OUT_DIR } else { Join-Path $HOME 'Documents\DB_backups' }

function Mask([string]$u) { if ($u) { [regex]::Replace($u, '//[^@]*@', '//***:***@') } else { '' } }

if (-not $prd) { Write-Error 'Defina $env:PRD_DATABASE_URL'; exit 2 }
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$ts = Get-Date -Format 'dd_MM_yyyy_HH_mm'
$dumpFile = Join-Path $outDir "prd_dump_$ts.sql"

Write-Host "==> DUMP do PRD (READ-ONLY): $(Mask $prd)"
Write-Host "    arquivo: $dumpFile"
& pg_dump $prd --no-owner --no-acl --clean --if-exists --file=$dumpFile
if ($LASTEXITCODE -ne 0) { Write-Error 'pg_dump falhou'; exit 1 }
Write-Host "    OK"

if (-not $Restore) {
  Write-Host "==> Só dump (seguro). Para restaurar no HML: .\dump-prd-to-hml.ps1 -Restore"
  exit 0
}

if (-not $hml) { Write-Error 'Defina $env:HML_DATABASE_URL para -Restore'; exit 2 }
if ($hml -eq $prd) { Write-Error 'HML == PRD. ABORTADO (nunca restaurar no PRD).'; exit 2 }

Write-Host ''
Write-Host '!!! RESTORE DESTRUTIVO no HML (--clean dropa e recria objetos) !!!'
Write-Host "    alvo HML: $(Mask $hml)"
if (-not $Yes) {
  $ans = Read-Host "Digite 'HML' para confirmar o restore"
  if ($ans -ne 'HML') { Write-Host 'abortado.'; exit 1 }
}

Write-Host '==> RESTORE no HML'
& psql $hml -v ON_ERROR_STOP=1 -f $dumpFile
if ($LASTEXITCODE -ne 0) { Write-Error 'restore falhou'; exit 1 }
Write-Host '    OK'
Write-Host ''
Write-Host '==> Proximos passos no HML (a partir de server/):'
Write-Host "    `$env:DATABASE_URL = '$hml'; npm run db:migrate"
Write-Host "    `$env:DATABASE_URL = '$hml'; npm run db:backfill"
