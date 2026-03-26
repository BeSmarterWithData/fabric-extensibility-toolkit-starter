<#
.SYNOPSIS
    Bundles PBIP (Power BI Project) model and report definition files into JSON
    bundles that can be served as static assets for runtime deployment via the
    Fabric Create Item API.

.DESCRIPTION
    Reads a PBIP folder structure (SemanticModel + Report) and produces two JSON
    bundle files:
      - GovernanceModel.bundle.json  (TMDL format, for SemanticModel creation)
      - GovernanceReport.bundle.json (PBIR format, for Report creation)

    Each bundle contains an array of parts with paths and content. Text files are
    stored as plain strings; binary files are stored as base64 with a flag.

.PARAMETER PBIPRoot
    Path to the PBIP project folder containing the .SemanticModel and .Report
    subfolders.

.PARAMETER OutputDir
    Output directory for the generated bundles (default: Workload/app/assets/).

.EXAMPLE
    .\BundlePBIP.ps1 -PBIPRoot "C:\PowerBIGovernanceModel\Semantic Link Labs Model"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$PBIPRoot,

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = (Join-Path $PSScriptRoot "..\..\Workload\app\assets")
)

$ErrorActionPreference = "Stop"

# Known binary file extensions
$BinaryExtensions = @('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg', '.woff', '.woff2', '.ttf', '.eot')

function ConvertTo-Bundle {
    param(
        [string]$ItemRoot,
        [string]$Format,
        [string[]]$IncludeFolders
    )

    $parts = @()

    foreach ($folder in $IncludeFolders) {
        $folderPath = Join-Path $ItemRoot $folder
        if (-not (Test-Path $folderPath)) {
            if ($folder -eq "definition" -or $folder -eq "definition.pbism" -or $folder -eq "definition.pbir") {
                # These are critical — check if it's a file rather than folder
                if (Test-Path (Join-Path $ItemRoot $folder) -PathType Leaf) {
                    $file = Get-Item (Join-Path $ItemRoot $folder)
                    $isBinary = $BinaryExtensions -contains $file.Extension.ToLower()
                    if ($isBinary) {
                        $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName))
                    } else {
                        $content = [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8)
                    }
                    $parts += @{
                        path    = $folder
                        content = $content
                        binary  = $isBinary
                    }
                    continue
                }
            }
            Write-Warning "Folder not found, skipping: $folderPath"
            continue
        }

        if (Test-Path $folderPath -PathType Leaf) {
            # It's a file, not a folder
            $file = Get-Item $folderPath
            $isBinary = $BinaryExtensions -contains $file.Extension.ToLower()
            if ($isBinary) {
                $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName))
            } else {
                $content = [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8)
            }
            $parts += @{
                path    = $folder
                content = $content
                binary  = $isBinary
            }
            continue
        }

        # It's a directory — recurse
        $files = Get-ChildItem $folderPath -Recurse -File
        foreach ($file in $files) {
            $relativePath = $file.FullName.Substring($ItemRoot.Length).TrimStart('\', '/')
            # Normalize to forward slashes for the API
            $relativePath = $relativePath -replace '\\', '/'
            $isBinary = $BinaryExtensions -contains $file.Extension.ToLower()

            if ($isBinary) {
                $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName))
            } else {
                $content = [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8)
            }

            $parts += @{
                path    = $relativePath
                content = $content
                binary  = $isBinary
            }
        }
    }

    return @{
        format = $Format
        parts  = $parts
    }
}

# ---- Locate the PBIP subfolders ----
$modelDir = Get-ChildItem $PBIPRoot -Directory | Where-Object { $_.Name -like "*.SemanticModel" } | Select-Object -First 1
$reportDir = Get-ChildItem $PBIPRoot -Directory | Where-Object { $_.Name -like "*.Report" } | Select-Object -First 1

if (-not $modelDir) { throw "Could not find .SemanticModel folder in $PBIPRoot" }
if (-not $reportDir) { throw "Could not find .Report folder in $PBIPRoot" }

Write-Host "Semantic Model: $($modelDir.FullName)"
Write-Host "Report:         $($reportDir.FullName)"

# ---- Bundle Semantic Model (TMDL) ----
Write-Host "`nBundling Semantic Model..."
$modelBundle = ConvertTo-Bundle -ItemRoot $modelDir.FullName -Format "TMDL" -IncludeFolders @("definition", "definition.pbism")
Write-Host "  Parts: $($modelBundle.parts.Count)"

$modelOutput = Join-Path $OutputDir "GovernanceModel.bundle.json"
$modelBundle | ConvertTo-Json -Depth 10 -Compress | Set-Content $modelOutput -Encoding UTF8
Write-Host "  Written: $modelOutput ($('{0:N0}' -f (Get-Item $modelOutput).Length) bytes)"

# ---- Bundle Report (PBIR) ----
Write-Host "`nBundling Report..."
$reportBundle = ConvertTo-Bundle -ItemRoot $reportDir.FullName -Format "PBIR" -IncludeFolders @("definition", "StaticResources", "definition.pbir")
Write-Host "  Parts: $($reportBundle.parts.Count)"

$reportOutput = Join-Path $OutputDir "GovernanceReport.bundle.json"
$reportBundle | ConvertTo-Json -Depth 10 -Compress | Set-Content $reportOutput -Encoding UTF8
Write-Host "  Written: $reportOutput ($('{0:N0}' -f (Get-Item $reportOutput).Length) bytes)"

Write-Host "`nDone! Bundles are ready in $OutputDir"
