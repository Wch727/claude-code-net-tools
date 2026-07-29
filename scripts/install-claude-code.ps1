param(
  [string]$Name = "net-tools",
  [ValidateSet("local", "user", "project")]
  [string]$Scope = "local",
  [ValidateSet("auto", "node", "python")]
  [string]$Runtime = "auto",
  [string]$Proxy = "",
  [string]$Providers = "",
  [string]$Browser = "",
  [string]$BrowserProfile = "",
  [switch]$BrowserHeaded,
  [switch]$Python,
  [switch]$ShowConsole,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Test-CommandAvailable([string]$Command) {
  return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

if (-not (Test-CommandAvailable "claude")) {
  throw "Claude Code CLI 'claude' was not found in PATH. Install Claude Code first, then rerun this script."
}

if ($Python) {
  $Runtime = "python"
}

if ($Runtime -eq "auto") {
  if (Test-CommandAvailable "node") {
    $Runtime = "node"
  } elseif (Test-CommandAvailable "python") {
    $Runtime = "python"
  } else {
    throw "Neither 'node' nor 'python' was found in PATH. Install Node.js 20+ or Python 3.10+."
  }
}

$envArgs = @()
if ($Proxy.Trim()) {
  $envArgs += @("-e", "CLAUDE_NET_PROXY=$Proxy")
}
if ($Providers.Trim()) {
  $envArgs += @("-e", "CLAUDE_NET_SEARCH_PROVIDERS=$Providers")
}
if ($Browser.Trim()) {
  if ($Browser.Trim().ToLowerInvariant() -notin @("chrome", "msedge", "firefox", "webkit")) {
    throw "Browser must be chrome, msedge, firefox, or webkit."
  }
  $envArgs += @("-e", "CLAUDE_NET_BROWSER=$($Browser.Trim().ToLowerInvariant())")
}
if ($BrowserProfile.Trim()) {
  $envArgs += @("-e", "CLAUDE_NET_BROWSER_PROFILE=$($BrowserProfile.Trim())")
}
if ($BrowserHeaded) {
  $envArgs += @("-e", "CLAUDE_NET_BROWSER_HEADED=true")
} else {
  $envArgs += @("-e", "CLAUDE_NET_BROWSER_HEADED=false")
}

if ($Runtime -eq "node") {
  if (-not (Test-CommandAvailable "node")) { throw "Runtime 'node' selected, but node was not found in PATH." }
  $Command = (Get-Command "node").Source
  $Entry = Join-Path $Root "claude_net_mcp.mjs"
} else {
  if (-not (Test-CommandAvailable "python")) { throw "Runtime 'python' selected, but python was not found in PATH." }
  $Command = (Get-Command "python").Source
  $Entry = Join-Path $Root "claude_net_mcp.py"
}

if (-not (Test-Path $Entry)) {
  throw "MCP entry file not found: $Entry"
}

if ($Force) {
  Write-Host "Removing existing Claude Code MCP server '$Name' if present..."
  & claude mcp remove $Name -s $Scope 2>$null | Out-Null
}

$RuntimeArgs = @($Entry)
$HiddenLauncher = Join-Path $PSScriptRoot "windows-hidden-launcher.py"
if (-not $ShowConsole -and (Test-CommandAvailable "pythonw") -and (Test-Path $HiddenLauncher)) {
  $RuntimeArgs = @($HiddenLauncher, $Command, $Entry)
  $Command = (Get-Command "pythonw").Source
  Write-Host "Using the Windows hidden launcher to prevent console popups."
}

$argsList = @("mcp", "add", "--scope", $Scope, $Name)
if ($envArgs.Count -gt 0) {
  $argsList += $envArgs
  $argsList += "--"
}
$argsList += @($Command) + $RuntimeArgs

Write-Host "Installing Claude Code MCP server '$Name' in $Scope scope with $Runtime runtime..."
Write-Host "claude $($argsList -join ' ')"
& claude @argsList

Write-Host ""
Write-Host "Done. In Claude Code, try: Use net-tools net_doctor live=true query='Claude Code MCP'."
