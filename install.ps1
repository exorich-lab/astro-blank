#Requires -Version 5.1
<#
.SYNOPSIS
  Install Astro Blank starter on Windows (PowerShell).

.DESCRIPTION
  Mirrors install.sh: downloads the template, npm install, syncs AI skills,
  prefetches MCP packages, sets up UI Pro Max + humanizer.
  Does not run git init (project starts without a local git repo).

  Installer version: 2026-07-22.7

.PARAMETER TargetDir
  Destination folder. Default: my-astro-app. Use "." for the current directory.

.EXAMPLE
  # Recommended (avoids CDN cache; works on Windows PowerShell 5.1)
  Set-ExecutionPolicy -Scope Process Bypass
  $u = "https://raw.githubusercontent.com/exorich-lab/astro-blank/main/install.ps1?ts=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
  $out = "$env:TEMP\astro-blank-install.ps1"
  Invoke-WebRequest $u -OutFile $out -UseBasicParsing
  & $out -TargetDir .

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
$script:InstallerVersion = "2026-07-22.7"
# Exit code of last Invoke-NodeCli call (never mixed with stdout).
$script:LastNodeExitCode = 0

# Restricted machines block npm.ps1 / npx.ps1. Process scope only.
try {
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction Stop
}
catch {
  # Still OK if we invoke .cmd shims after bypass attempt.
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
  $cmd = Get-Command "$Name.cmd" -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
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

  # Call npm.cmd / npx.cmd directly with an argument array.
  # Do not wrap through cmd /c quoting - it eats "." and breaks degit targets on Windows.
  $startParams = @{
    FilePath         = $exe
    ArgumentList     = $Arguments
    WorkingDirectory = (Get-Location).Path
    Wait             = $true
    PassThru         = $true
    NoNewWindow      = $true
  }

  if ($Quiet) {
    $outLog = [System.IO.Path]::GetTempFileName()
    $errLog = [System.IO.Path]::GetTempFileName()
    try {
      $startParams.RedirectStandardOutput = $outLog
      $startParams.RedirectStandardError = $errLog
      $proc = Start-Process @startParams
    }
    finally {
      Remove-Item -LiteralPath $outLog, $errLog -Force -ErrorAction SilentlyContinue
    }
  }
  else {
    # Console inherits stdout/stderr; nothing is returned into PowerShell variables.
    $proc = Start-Process @startParams
  }

  if ($null -eq $proc -or $null -eq $proc.ExitCode) {
    $script:LastNodeExitCode = 0
  }
  else {
    $script:LastNodeExitCode = [int]$proc.ExitCode
  }
}

function Install-TemplateFiles {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  # Prefer git clone on Windows: more reliable than npx degit under PowerShell quoting.
  $tmp = Join-Path $env:TEMP ("astro-blank-template-" + [guid]::NewGuid().ToString("N"))
  $repoUrl = "https://github.com/exorich-lab/astro-blank.git"

  Write-Host "Cloning template via git..."
  $clone = Start-Process -FilePath "git" -ArgumentList @(
    "clone", "--depth", "1", "--single-branch", "--branch", "main", $repoUrl, $tmp
  ) -Wait -PassThru -NoNewWindow

  if ($null -eq $clone -or $clone.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $tmp "package.json"))) {
    throw "git clone failed (exit code $($clone.ExitCode)). Check network/git access to $repoUrl"
  }

  # Fresh project should not keep the template's git history.
  $gitDir = Join-Path $tmp ".git"
  if (Test-Path -LiteralPath $gitDir) {
    Remove-Item -LiteralPath $gitDir -Recurse -Force
  }

  if ($Destination -eq "." -or $Destination -eq "./" -or $Destination -eq ".\\") {
    Get-ChildItem -LiteralPath $tmp -Force | ForEach-Object {
      Move-Item -LiteralPath $_.FullName -Destination (Join-Path (Get-Location).Path $_.Name) -Force
    }
  }
  else {
    if (-not (Test-Path -LiteralPath $Destination)) {
      New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    }
    Get-ChildItem -LiteralPath $tmp -Force | ForEach-Object {
      Move-Item -LiteralPath $_.FullName -Destination (Join-Path $Destination $_.Name) -Force
    }
  }

  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
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
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw ($FailMessage + " (exit code $LASTEXITCODE)")
  }
}

Write-Step "Astro Blank Windows installer $script:InstallerVersion"
Write-Step "Starting setup for Astro Blank application..."
Assert-Prerequisites

$resolvedTarget = $TargetDir
$isCurrentDir = ($TargetDir -eq "." -or $TargetDir -eq "./" -or $TargetDir -eq ".\\")
if ($isCurrentDir) {
  $resolvedTarget = (Get-Location).Path
}

if (Test-DirectoryNonEmpty -Path $resolvedTarget) {
  Write-Host "Directory $TargetDir already exists and is not empty." -ForegroundColor Yellow
  Write-Host "Please choose a different name or run this in an empty directory." -ForegroundColor Yellow
  exit 1
}

Write-Step "Downloading template..."
$installTarget = if ($isCurrentDir) { "." } else { $TargetDir }
Install-TemplateFiles -Destination $installTarget

$packageJson = if ($isCurrentDir) {
  Join-Path (Get-Location).Path "package.json"
}
else {
  Join-Path $installTarget "package.json"
}

if (-not (Test-Path -LiteralPath $packageJson)) {
  throw "template download failed: package.json not found in '$installTarget'"
}

if (-not $isCurrentDir) {
  Set-Location -LiteralPath $installTarget
}

Write-Step "Installing dependencies..."
Invoke-NodeCli -Tool "npm" -Arguments @("install")
if ($script:LastNodeExitCode -ne 0) {
  throw "npm install failed (exit code $($script:LastNodeExitCode))"
}

Write-Step "Syncing AI skills via autoskills (latest versions)..."
try {
  Invoke-NodeCli -Tool "npx" -Arguments @("--yes", "autoskills", "--yes", "--agent", "codex")
  if ($script:LastNodeExitCode -ne 0) {
    throw "autoskills exited with $($script:LastNodeExitCode)"
  }
}
catch {
  Write-Host "autoskills sync failed (network or registry issue)." -ForegroundColor Yellow
  Write-Host "   Continuing with the template-bundled skills." -ForegroundColor Yellow
}

# Prefetch MCP packages into the npm cache only - never start MCP servers (they hang on stdin).
Write-Step "Prefetching MCP server packages (cache only, no server start)..."
foreach ($mcpPkg in @("@magicuidesign/mcp@latest", "search-console-mcp@latest")) {
  try {
    Invoke-NodeCli -Tool "npm" -Arguments @("cache", "add", $mcpPkg) -Quiet
    if ($script:LastNodeExitCode -ne 0) {
      throw "npm cache add failed for $mcpPkg"
    }
    Write-Host "  cached $mcpPkg"
  }
  catch {
    Write-Host "Failed to prefetch $mcpPkg. Check network/npm. (safe to ignore; MCP client will fetch later)" -ForegroundColor Yellow
  }
}

if (-not (Test-CommandExists "uv")) {
  Write-Host "uv not found, cannot install analytics-mcp tool." -ForegroundColor Yellow
  Write-Host "   Install uv: https://docs.astral.sh/uv/getting-started/installation/" -ForegroundColor Yellow
  Write-Host "   PowerShell: irm https://astral.sh/uv/install.ps1 | iex" -ForegroundColor Yellow
}
else {
  try {
    uv tool install --force analytics-mcp 1>$null 2>$null
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
      throw "uv tool install failed"
    }
  }
  catch {
    Write-Host "Failed to install analytics-mcp from uv. You can try:" -ForegroundColor Yellow
    Write-Host "   uv tool install --force analytics-mcp" -ForegroundColor Yellow
  }
}

Write-Step "Setting up UI/UX Pro Max Design System..."
if (-not (Test-CommandExists "uipro")) {
  Write-Host "uipro-cli not found globally. Installing..."
  try {
    Invoke-NodeCli -Tool "npm" -Arguments @("install", "-g", "uipro-cli")
    if ($script:LastNodeExitCode -ne 0) {
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
if (-not $isCurrentDir) {
  Write-Host "cd $installTarget"
}
Write-Host "npm run dev"
Write-Host ""
Write-Host "Magic UI MCP project configs are included:"
Write-Host "- Codex: .codex/config.toml"
Write-Host "- Antigravity / VS Code MCP: .vscode/mcp.json"
Write-Host "- Generic MCP clients: .mcp.json"
Write-Host "Restart Codex or Antigravity after opening the project so MCP servers reload."
