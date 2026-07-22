#Requires -Version 5.1
<#
.SYNOPSIS
  Install Astro Blank starter on Windows (PowerShell).

.DESCRIPTION
  Mirrors install.sh: downloads the template via degit, git init, npm install,
  syncs AI skills, prefetches MCP packages, sets up UI Pro Max + humanizer.

  Installer version: 2026-07-22.4

.PARAMETER TargetDir
  Destination folder. Default: my-astro-app. Use "." for the current directory.

.EXAMPLE
  # Recommended (avoids raw.githubusercontent.com cache + iex quoting issues)
  $u = "https://raw.githubusercontent.com/exorich-lab/astro-blank/main/install.ps1?ts=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
  Invoke-WebRequest $u -OutFile "$env:TEMP\astro-blank-install.ps1" -UseBasicParsing
  Set-ExecutionPolicy -Scope Process Bypass
  & "$env:TEMP\astro-blank-install.ps1" -TargetDir .

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
$script:InstallerVersion = "2026-07-22.4"
# Exit code of last Invoke-NodeCli call (never mixed with stdout).
$script:LastNodeExitCode = 0

# Restricted machines block npm.ps1 / npx.ps1. Process scope only.
try {
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction Stop
}
catch {
  # Still OK if we invoke .cmd via ProcessStartInfo below.
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

function Quote-ProcessArg {
  param([string]$Text)
  if ($null -eq $Text) { return '""' }
  if ($Text -notmatch '[\s"]') { return $Text }
  return '"' + ($Text -replace '"', '\"') + '"'
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

  # Run the .cmd shim through cmd.exe so Restricted policy never loads Node's .ps1 wrappers.
  $argLine = ($Arguments | ForEach-Object { Quote-ProcessArg -Text ([string]$_) }) -join " "
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/d /s /c $(Quote-ProcessArg -Text "`"$exe`" $argLine")"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $psi.WorkingDirectory = (Get-Location).Path

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  [void]$proc.Start()
  $stdout = $proc.StandardOutput.ReadToEnd()
  $stderr = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()

  if (-not $Quiet) {
    # Write-Host never enters the success pipeline (critical for exit-code checks).
    if ($stdout) {
      foreach ($line in ($stdout -split "`r?`n")) {
        if ($line.Length -gt 0) { Write-Host $line }
      }
    }
    if ($stderr) {
      foreach ($line in ($stderr -split "`r?`n")) {
        if ($line.Length -gt 0) { Write-Host $line }
      }
    }
  }

  $script:LastNodeExitCode = [int]$proc.ExitCode
  # Intentionally return nothing — callers must use $script:LastNodeExitCode.
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

function Get-PackageJsonPath {
  param([string]$Dir)
  if ($Dir -eq "." -or $Dir -eq "./" -or $Dir -eq ".\\") {
    return (Join-Path (Get-Location).Path "package.json")
  }
  return (Join-Path ((Resolve-Path -LiteralPath $Dir -ErrorAction SilentlyContinue).Path) "package.json")
}

Write-Step "Astro Blank Windows installer $script:InstallerVersion"
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
$degitTarget = $TargetDir
if ($TargetDir -eq "." -or $TargetDir -eq "./" -or $TargetDir -eq ".\\") {
  $degitTarget = "."
}

Invoke-NodeCli -Tool "npx" -Arguments @("--yes", "degit", "exorich-lab/astro-blank", $degitTarget)
$packageJson = if ($degitTarget -eq ".") {
  Join-Path (Get-Location).Path "package.json"
}
else {
  Join-Path $degitTarget "package.json"
}

# Success = files on disk. Exit code alone is unreliable across PowerShell/cmd shims.
if (-not (Test-Path -LiteralPath $packageJson)) {
  throw "degit failed: package.json not found in '$degitTarget' (node exit code $($script:LastNodeExitCode))"
}
if ($script:LastNodeExitCode -ne 0) {
  Write-Host "degit returned exit code $($script:LastNodeExitCode), but package.json exists — continuing." -ForegroundColor Yellow
}

if ($degitTarget -ne ".") {
  Set-Location -LiteralPath $degitTarget
}

Write-Step "Initializing git repository..."
Invoke-External -FailMessage "git init failed" -Script { git init }

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

# Prefetch MCP packages into the npm cache only — never start MCP servers (they hang on stdin).
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
