# PowerShell test script
# This runs each step separately with proper waits

Write-Host "`n1️⃣  Starting server..." -ForegroundColor Cyan
$serverProcess = Start-Process -FilePath "node" -ArgumentList "app.js" -PassThru -NoNewWindow
Start-Sleep -Seconds 5

Write-Host "2️⃣  Testing API request..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/stock/AAPL?interval=1d" -Method Get
    Write-Host "✅ Got data immediately! $($response.chart.result[0].timestamp.Count) bars" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 503) {
        Write-Host "⏳ Got 503 - Symbol queued for collection" -ForegroundColor Yellow
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "   Retry after: $($errorBody.retryAfter)s" -ForegroundColor Yellow
        
        Write-Host "3️⃣  Waiting and retrying..." -ForegroundColor Cyan
        Start-Sleep -Seconds $errorBody.retryAfter
        
        try {
            $retry = Invoke-RestMethod -Uri "http://localhost:3001/api/stock/AAPL?interval=1d" -Method Get
            $bars = $retry.chart.result[0].timestamp.Count
            $close = $retry.chart.result[0].indicators.quote[0].close[-1]
            Write-Host "✅ SUCCESS! Got $bars bars, latest close: `$$close" -ForegroundColor Green
        } catch {
            Write-Host "❌ Retry failed: $($_.Exception.Message)" -ForegroundColor Red
            Stop-Process -Id $serverProcess.Id -Force
            exit 1
        }
    } elseif ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "❌ Got 404 - Symbol not found!" -ForegroundColor Red
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "   Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "   Message: $($errorBody.message)" -ForegroundColor Red
        Stop-Process -Id $serverProcess.Id -Force
        exit 1
    } else {
        Write-Host "❌ Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
        Stop-Process -Id $serverProcess.Id -Force
        exit 1
    }
}

Write-Host "`n4️⃣  Checking stats..." -ForegroundColor Cyan
$stats = Invoke-RestMethod -Uri "http://localhost:3001/stats" -Method Get
Write-Host "   Active symbols: $($stats.symbols.active_symbols)" -ForegroundColor White
Write-Host "   Total candles: $($stats.candles | Measure-Object -Property count -Sum).Sum" -ForegroundColor White

Write-Host "`n✅ TEST COMPLETE!" -ForegroundColor Green
Write-Host "`nPress Ctrl+C to stop server...`n" -ForegroundColor Yellow
Stop-Process -Id $serverProcess.Id -Force
