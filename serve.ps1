# 개발용 정적 파일 서버 (Node/Python 없이 미리보기용)
# 사용: powershell -ExecutionPolicy Bypass -File serve.ps1  →  http://localhost:5500
param([int]$Port = 5500)

$root = $PSScriptRoot
$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = $ctx.Request.Url.LocalPath.TrimStart("/")
  if ([string]::IsNullOrEmpty($path)) { $path = "index.html" }
  $file = Join-Path $root $path
  if (Test-Path $file -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    $ctype = $mime[$ext]; if (-not $ctype) { $ctype = "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $ctx.Response.ContentType = $ctype
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
    $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
  }
  $ctx.Response.OutputStream.Close()
}
