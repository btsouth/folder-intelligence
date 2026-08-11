param(
    [Parameter(Mandatory = $true)]
    [string]$VaultPath
)

$ErrorActionPreference = 'Stop'

$resolvedVault = (Resolve-Path -LiteralPath $VaultPath).Path
$obsidianDirectory = Join-Path $resolvedVault '.obsidian'
if (-not (Test-Path -LiteralPath $obsidianDirectory -PathType Container)) {
    throw "The selected folder is not an Obsidian vault: $resolvedVault"
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$artifacts = @('main.js', 'manifest.json', 'styles.css')
foreach ($artifact in $artifacts) {
    $source = Join-Path $repositoryRoot $artifact
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Missing $artifact. Run npm run build first."
    }
}

$pluginDirectory = Join-Path $obsidianDirectory 'plugins\folder-intelligence'
New-Item -ItemType Directory -Force -Path $pluginDirectory | Out-Null
foreach ($artifact in $artifacts) {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot $artifact) -Destination $pluginDirectory -Force
}

Write-Output "Installed Folder Intelligence to $pluginDirectory"
Write-Output 'Reload Obsidian, then enable Folder Intelligence under Community plugins.'
