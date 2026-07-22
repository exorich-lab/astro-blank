#Requires -Version 5.1
<#
.SYNOPSIS
  Install Astro Blank starter on Windows (PowerShell).

.DESCRIPTION
  Mirrors install.sh: downloads the template via degit, git init, npm install,
  syncs AI skills, refreshes MCP packages, sets up UI Pro Max + humanizer.

.PARAMETER TargetDir
  Destination folder. Default: my-astro-app. Use "." for the current directory.

.EXAMPLE
  # Install into current folder
  iex "& { $(irm https://raw.githubusercontent.com/exorich-lab/astro-blank/main/install.ps1) } -TargetDir ."

.EXAMPLE
  # Install into a new folder named frontend
  iex "& { $(irm https://raw.githubusercontent.com/exorich-lab/astro-blank/main/install.ps1) } -TargetDir frontend"

.EXAMPLE
  # Default folder (my-astro-app) — simple one-liner
  irm https://raw.githubusercontent.com/exorich-lab/astro-blank/main/install.ps1 | iex

.EXAMPLE
  # Local file
  .\install.ps1 -TargetDir .
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$TargetDir = $(
    if ($env:ASTRO_BLANK_DIR -and $env:ASTRO_BLANK_DIR.Trim()) {
      $env:ASTRO_BLANK_DIR.Trim()
    }
    else {
      "my-astro-app"
    }
  )
)

$ErrorActionPreference = "Stop"

# Restricted machines block npm.ps1 / npx.ps1. Process scope only — does not change system policy.
try {
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction Stop
}
catch {
  # Still OK if we call npm.cmd / npx.cmd via cmd.exe below.
}

function Write-Step {
  param([string]$Message)
  Write-Host $Message
}

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-NodeCli {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("npm", "npx")]
    [string]$Name
  )
  # Prefer .cmd shims so Restricted execution policy cannot block Node's .ps1 wrappers.
  $cmd = Get-Command "$Name.cmd" -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  return $null
}

function Invoke-NodeCli {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("npm", "npx")]
    [string]$Tool,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [switch]$Quiet
  )

  $exe = Get-NodeCli -Name $Tool
  if (-not $exe) {
    throw "$Tool not found on PATH"
  }

  # cmd.exe avoids PowerShell script-block invocation of blocked .ps1 files.
  $quotedArgs = foreach ($arg in $Arguments) {
    if ($null -eq $arg) { '""'; continue }
    $text = [string]$arg
    if ($text -match '[\s"&<>|^]') {
      '"' + ($text -replace '"', '\"') + '"'
    }
    else {
      $text
    }
  }
  $argLine = [string]::Join(" ", $quotedArgs)
  $commandLine = "`"$exe`" $argLine"

  if ($Quiet) {
    & cmd.exe /d /c $commandLine 1>$null 2>$null
  }
  else {
    & cmd.exe /d /c $commandLine
  }

  return $LASTEXITCODE
}

function Assert-Prerequisites {
  $missing = @()
  if (-not (Test-CommandExists "node")) { $missing += "node" }
  if (-not (Get-NodeCli -Name "npm")) { $missing += "npm" }
  if (-not (Get-NodeCli -Name "npx")) { $missing += "npx" }
  if (-not (Test-CommandExists "git")) { $missing += "git" }

  if ($missing.Count -gt 0) {
    Write-Host "Missing required tools: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "Install Node.js LTS (includes npm/npx) and Git for Windows, then re-run." -ForegroundColor Yellow
    Write-Host "  Node: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "  Git:  https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
  }
}

function Test-DirectoryNonEmpty {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    return $false
  }
  $items = Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notin @(".", "..") }
  return [bool]$items
}

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Script,
    [string]$FailMessage
  )
  & $Script
  if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
    throw ($FailMessage + " (exit code $LASTEXITCODE)")
  }
}

Write-Step "Starting setup for Astro Blank application..."
Assert-Prerequisites

$resolvedTarget = $TargetDir
if ($TargetDir -eq "." -or $TargetDir -eq "./" -or $TargetDir -eq ".\\") {
  $resolvedTarget = (Get-Location).Path
}

if (Test-DirectoryNonEmpty -Path $resolvedTarget) {
  Write-Host "Directory $TargetDir already exists and is not empty." -ForegroundColor Yellow
  Write-Host "Please choose a different name or run this in an empty directory." -ForegroundColor Yellow
  exit 1
}

Write-Step "Downloading template..."
# degit accepts relative paths; keep user-facing TargetDir for folder creation
$degitTarget = $TargetDir
if ($TargetDir -eq "." -or $TargetDir -eq "./" -or $TargetDir -eq ".\\") {
  $degitTarget = "."
}
$degitExit = Invoke-NodeCli -Tool "npx" -Arguments @("--yes", "degit", "exorich-lab/astro-blank", $degitTarget)
if ($degitExit -ne 0) {
  throw "degit failed (exit code $degitExit)"
}

if ($degitTarget -ne ".") {
  Set-Location -LiteralPath $degitTarget
}

Write-Step "Initializing git repository..."
Invoke-External -FailMessage "git init failed" -Script { git init }

Write-Step "Installing dependencies..."
$npmInstallExit = Invoke-NodeCli -Tool "npm" -Arguments @("install")
if ($npmInstallExit -ne 0) {
  throw "npm install failed (exit code $npmInstallExit)"
}

Write-Step "Syncing AI skills via autoskills (latest versions)..."
try {
  $autoskillsExit = Invoke-NodeCli -Tool "npx" -Arguments @("--yes", "autoskills", "--yes", "--agent", "codex")
  if ($autoskillsExit -ne 0) {
    throw "autoskills exited with $autoskillsExit"
  }
}
catch {
  Write-Host "autoskills sync failed (network or registry issue)." -ForegroundColor Yellow
  Write-Host "   Continuing with the template-bundled skills." -ForegroundColor Yellow
}

Write-Step "Refreshing MCP server packages to latest versions..."
try {
  $mcpExit = Invoke-NodeCli -Tool "npx" -Arguments @("--yes", "@magicuidesign/mcp@latest", "--help") -Quiet
  if ($mcpExit -ne 0) {
    throw "mcp help failed"
  }
}
catch {
  Write-Host "Failed to refresh @magicuidesign/mcp@latest. Check network/npm." -ForegroundColor Yellow
}

try {
  $scExit = Invoke-NodeCli -Tool "npx" -Arguments @("--yes", "search-console-mcp@latest", "--help") -Quiet
  if ($scExit -ne 0) {
    throw "search-console help failed"
  }
}
catch {
  Write-Host "Failed to refresh search-console-mcp@latest. Check network/npm." -ForegroundColor Yellow
}

if (-not (Test-CommandExists "uv")) {
  Write-Host "uv not found, cannot verify/pull analytics-mcp." -ForegroundColor Yellow
  Write-Host "   Install uv: https://docs.astral.sh/uv/getting-started/installation/" -ForegroundColor Yellow
  Write-Host "   PowerShell: irm https://astral.sh/uv/install.ps1 | iex" -ForegroundColor Yellow
}
else {
  $uvxOk = $false
  try {
    uvx analytics-mcp --help 1>$null 2>$null
    if ($LASTEXITCODE -eq $null -or $LASTEXITCODE -eq 0) {
      $uvxOk = $true
    }
  }
  catch {
    $uvxOk = $false
  }

  if (-not $uvxOk) {
    Write-Host "analytics-mcp not available in uv. Installing/refreshing..." -ForegroundColor Yellow
    try {
      uv tool install --force analytics-mcp 1>$null 2>$null
      if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
        throw "uv tool install failed"
      }
    }
    catch {
      Write-Host "Failed to install analytics-mcp from uv. You can try:" -ForegroundColor Yellow
      Write-Host "   uv tool install --force analytics-mcp" -ForegroundColor Yellow
    }
  }
}

Write-Step "Setting up UI/UX Pro Max Design System..."
if (-not (Test-CommandExists "uipro")) {
  Write-Host "uipro-cli not found globally. Installing..."
  try {
    $uiproInstallExit = Invoke-NodeCli -Tool "npm" -Arguments @("install", "-g", "uipro-cli")
    if ($uiproInstallExit -ne 0) {
      throw "npm install -g uipro-cli failed"
    }
  }
  catch {
    Write-Host "Failed to install uipro-cli globally. Skipping UI Pro Max init." -ForegroundColor Yellow
    Write-Host "   Try manually: npm.cmd install -g uipro-cli && uipro init --ai antigravity" -ForegroundColor Yellow
  }
}

if (Test-CommandExists "uipro") {
  Write-Step "Initializing AI Design Skill..."
  try {
    uipro init --ai antigravity
  }
  catch {
    Write-Host "uipro init failed. Continuing without UI Pro Max skill refresh." -ForegroundColor Yellow
  }

  # Fix: uipro creates .agent (singular), but we need .agents (plural)
  if (Test-Path -LiteralPath ".agent\skills\ui-ux-pro-max") {
    New-Item -ItemType Directory -Force -Path ".agents\skills" | Out-Null
    if (Test-Path -LiteralPath ".agents\skills\ui-ux-pro-max") {
      Remove-Item -LiteralPath ".agents\skills\ui-ux-pro-max" -Recurse -Force
    }
    Move-Item -LiteralPath ".agent\skills\ui-ux-pro-max" -Destination ".agents\skills\ui-ux-pro-max" -Force
    Remove-Item -LiteralPath ".agent" -Recurse -Force -ErrorAction SilentlyContinue
  }

  if (Test-Path -LiteralPath "ui-ux-pro-max-skill") {
    New-Item -ItemType Directory -Force -Path ".agents\skills" | Out-Null
    if (Test-Path -LiteralPath ".agents\skills\ui-ux-pro-max") {
      Remove-Item -LiteralPath ".agents\skills\ui-ux-pro-max" -Recurse -Force
    }
    Move-Item -LiteralPath "ui-ux-pro-max-skill" -Destination ".agents\skills\ui-ux-pro-max" -Force
  }
  elseif (Test-Path -LiteralPath ".uipro") {
    New-Item -ItemType Directory -Force -Path ".agents\skills" | Out-Null
    if (Test-Path -LiteralPath ".agents\skills\ui-ux-pro-max") {
      Remove-Item -LiteralPath ".agents\skills\ui-ux-pro-max" -Recurse -Force
    }
    Move-Item -LiteralPath ".uipro" -Destination ".agents\skills\ui-ux-pro-max" -Force
  }
}

Write-Step "Updating humanizer skill to latest version..."
New-Item -ItemType Directory -Force -Path ".agents\skills" | Out-Null
$humanizerPath = Join-Path ".agents\skills" "humanizer"
if (Test-Path -LiteralPath (Join-Path $humanizerPath ".git")) {
  try {
    git -C $humanizerPath remote set-url origin https://github.com/blader/humanizer.git 2>$null
    git -C $humanizerPath pull --ff-only
  }
  catch {
    Write-Host "humanizer git pull failed. Keeping existing skill." -ForegroundColor Yellow
  }
}
else {
  if (Test-Path -LiteralPath $humanizerPath) {
    Remove-Item -LiteralPath $humanizerPath -Recurse -Force
  }
  try {
    git clone https://github.com/blader/humanizer.git $humanizerPath
  }
  catch {
    Write-Host "Failed to clone humanizer skill. Continuing." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Setup complete! You can now start the development server:" -ForegroundColor Green
if ($degitTarget -ne ".") {
  Write-Host "cd $degitTarget"
}
Write-Host "npm run dev"
Write-Host ""
Write-Host "Magic UI MCP project configs are included:"
Write-Host "- Codex: .codex/config.toml"
Write-Host "- Antigravity / VS Code MCP: .vscode/mcp.json"
Write-Host "- Generic MCP clients: .mcp.json"
Write-Host "Restart Codex or Antigravity after opening the project so MCP servers reload."
