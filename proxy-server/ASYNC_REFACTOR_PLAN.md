# Async Proxy Server Refactor Plan

**Goal:** Make `/proxy` endpoint non-blocking so health checks always respond instantly

## Current Architecture (Blocking)

```
Extension → POST /proxy → Handler blocks 3s → Response
Health Check → GET /health → Waits for handlers → Timeout ❌
```

## New Architecture (Non-Blocking with Job Queue)

```
Extension → POST /proxy → Push to channel → 202 Accepted (instant!)
                             ↓
                      [Job Queue Channel]
                             ↓
                      [Worker Pool (50 goroutines)]
                             ↓
                      Camera Request (3s)
                             ↓
                      Result → WebSocket broadcast

Health Check → GET /health → Instant response ✅
```

## Implementation Steps

### Step 1: Add Job Queue and Worker Pool

```go
// Global state
type ScanJob struct {
    ID       string
    IP       string
    Username string
    Password string
    Body     map[string]interface{}
}

type ScanResult struct {
    JobID string
    IP    string
    Camera *Camera // nil if not found
    Error  error
}

var (
    jobQueue    = make(chan ScanJob, 500)  // Buffered channel
    resultsChan = make(chan ScanResult, 500)
    workers     = 50  // Concurrent camera checks
)

// Start worker pool at initialization
func init() {
    // ... existing init code ...

    // Start worker pool
    for i := 0; i < workers; i++ {
        go cameraWorker()
    }

    // Start result broadcaster
    go resultBroadcaster()
}

func cameraWorker() {
    for job := range jobQueue {
        // Make camera request (this blocks for up to 3s)
        camera, err := checkCamera(job.IP, job.Username, job.Password, job.Body)

        // Send result
        resultsChan <- ScanResult{
            JobID:  job.ID,
            IP:     job.IP,
            Camera: camera,
            Error:  err,
        }
    }
}
```

### Step 2: Make /proxy Non-Blocking

```go
func handleProxyRequest(w http.ResponseWriter, r *http.Request) {
    if !setCORSHeaders(w, r) {
        return
    }

    var req ProxyRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid request", http.StatusBadRequest)
        return
    }

    // Create job
    job := ScanJob{
        ID:       generateJobID(),
        IP:       extractIPFromURL(req.URL),
        Username: req.Username,
        Password: req.Password,
        Body:     req.Body,
    }

    // Push to queue (non-blocking if channel has space)
    select {
    case jobQueue <- job:
        // Job queued successfully
        w.WriteHeader(http.StatusAccepted)  // 202 Accepted
        json.NewEncoder(w).Encode(map[string]string{
            "status": "queued",
            "job_id": job.ID,
        })
    default:
        // Queue full (unlikely with 500 capacity)
        http.Error(w, "Server busy", http.StatusServiceUnavailable)
    }
}
```

### Step 3: WebSocket for Results

```go
import "github.com/gorilla/websocket"

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool {
        return isOriginAllowed(r.Header.Get("Origin"))
    },
}

// Store active WebSocket connections
var (
    wsConnsMu sync.RWMutex
    wsConns   = make(map[*websocket.Conn]bool)
)

func handleResults(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        logger.Printf("WebSocket upgrade failed: %v", err)
        return
    }
    defer conn.Close()

    // Register connection
    wsConnsMu.Lock()
    wsConns[conn] = true
    wsConnsMu.Unlock()

    // Unregister on disconnect
    defer func() {
        wsConnsMu.Lock()
        delete(wsConns, conn)
        wsConnsMu.Unlock()
    }()

    // Keep connection alive (read messages but don't process)
    for {
        if _, _, err := conn.ReadMessage(); err != nil {
            break
        }
    }
}

func resultBroadcaster() {
    for result := range resultsChan {
        message, _ := json.Marshal(result)

        wsConnsMu.RLock()
        for conn := range wsConns {
            conn.WriteMessage(websocket.TextMessage, message)
        }
        wsConnsMu.RUnlock()
    }
}

func main() {
    http.HandleFunc("/proxy", handleProxyRequest)
    http.HandleFunc("/health", handleHealth)
    http.HandleFunc("/results", handleResults)  // New WebSocket endpoint
    // ...
}
```

### Step 4: Extension Changes

```javascript
// Open WebSocket for results
const ws = new WebSocket('ws://127.0.0.1:9876/results');
const discoveredCameras = [];

ws.onmessage = (event) => {
  const result = JSON.parse(event.data);
  if (result.Camera) {
    discoveredCameras.push(result.Camera);
    broadcastProgress(scannedCount++);
  }
};

// Send all IPs to proxy (non-blocking)
for (const ip of ipsToScan) {
  await fetch('http://127.0.0.1:9876/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://${ip}/axis-cgi/basicdeviceinfo.cgi`,
      method: 'POST',
      username: credentials.username,
      password: credentials.password,
      body: { /* ... */ }
    })
  });
  // No await on response - it returns immediately with 202!
}

// Wait for results via WebSocket
await waitForScanComplete(ipsToScan.length);
ws.close();
```

## Benefits

| Metric | Before (Blocking) | After (Async) |
|--------|------------------|---------------|
| **Health Check Response** | 3-30s (blocked) | <10ms (instant) |
| **Max Throughput** | ~15 req/s | ~50 req/s |
| **Queue Depth Visibility** | None | `len(jobQueue)` |
| **Resource Usage** | Goroutines block on I/O | Goroutines only during I/O |
| **Scan Time (254 IPs)** | ~3 min (with 15 concurrent) | ~1-1.5 min (with 50 workers) |

## Dependencies

```bash
go get github.com/gorilla/websocket
```

## Migration Path

1. **Phase 1:** Implement job queue + workers (internal only)
2. **Phase 2:** Add WebSocket endpoint `/results`
3. **Phase 3:** Update extension to use WebSocket
4. **Phase 4:** Make `/proxy` return 202 (backward compatible)
5. **Phase 5:** Remove old blocking `/proxy` code

## Backward Compatibility

Keep both modes:
- Old clients: Send to `/proxy-sync` (blocking, current behavior)
- New clients: Send to `/proxy` (async, 202 response)

This allows gradual migration.
