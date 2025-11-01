package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ScanRequest represents a bulk network scan request
type ScanRequest struct {
	IPs      []string `json:"ips"`
	Username string   `json:"username"`
	Password string   `json:"password"`
}

// ScanProgress represents real-time scan progress
type ScanProgress struct {
	ScanID        string                 `json:"scan_id"`
	IP            string                 `json:"ip"`
	Camera        map[string]interface{} `json:"camera,omitempty"`
	Error         string                 `json:"error,omitempty"`
	ScannedCount  int                    `json:"scanned_count"`
	TotalIPs      int                    `json:"total_ips"`
	CamerasFound  int                    `json:"cameras_found"`
	PercentDone   float64                `json:"percent_done"`
	IsComplete    bool                   `json:"is_complete"`
}

// ActiveScan represents an in-progress scan
type ActiveScan struct {
	ID           string
	TotalIPs     int
	ScannedCount int
	CamerasFound int
	ProgressChan chan ScanProgress
	Clients      map[*websocket.Conn]bool
	ClientsMu    sync.RWMutex
	StartTime    time.Time
}

var (
	activeScans   = make(map[string]*ActiveScan)
	activeScansMu sync.RWMutex
	wsUpgrader    = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return isOriginAllowed(r.Header.Get("Origin"))
		},
	}
)

// handleScanNetwork starts a bulk network scan
func handleScanNetwork(w http.ResponseWriter, r *http.Request) {
	if !setCORSHeaders(w, r) {
		return
	}

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logger.Printf("Failed to decode scan request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.IPs) == 0 {
		http.Error(w, "No IPs provided", http.StatusBadRequest)
		return
	}

	// Create scan ID
	scanID := fmt.Sprintf("scan_%d", time.Now().UnixNano())

	// Create active scan
	scan := &ActiveScan{
		ID:           scanID,
		TotalIPs:     len(req.IPs),
		ScannedCount: 0,
		CamerasFound: 0,
		ProgressChan: make(chan ScanProgress, 100),
		Clients:      make(map[*websocket.Conn]bool),
		StartTime:    time.Now(),
	}

	activeScansMu.Lock()
	activeScans[scanID] = scan
	activeScansMu.Unlock()

	logger.Printf("Starting network scan %s: %d IPs", scanID, len(req.IPs))

	// Start scan in background with worker pool
	go runNetworkScan(scan, req.IPs, req.Username, req.Password)

	// Return 202 Accepted immediately
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"scan_id":   scanID,
		"total_ips": len(req.IPs),
		"status":    "scanning",
	})
}

// runNetworkScan executes the scan with a worker pool
func runNetworkScan(scan *ActiveScan, ips []string, username, password string) {
	defer func() {
		// Send completion message
		scan.ProgressChan <- ScanProgress{
			ScanID:       scan.ID,
			ScannedCount: scan.TotalIPs,
			TotalIPs:     scan.TotalIPs,
			CamerasFound: scan.CamerasFound,
			PercentDone:  100.0,
			IsComplete:   true,
		}

		// Close progress channel after a delay (let clients receive completion)
		time.Sleep(2 * time.Second)
		close(scan.ProgressChan)

		// Clean up scan after 1 minute
		time.AfterFunc(1*time.Minute, func() {
			activeScansMu.Lock()
			delete(activeScans, scan.ID)
			activeScansMu.Unlock()
			logger.Printf("Scan %s cleaned up", scan.ID)
		})

		duration := time.Since(scan.StartTime)
		logger.Printf("Scan %s complete: %d cameras found in %v", scan.ID, scan.CamerasFound, duration)
	}()

	// Worker pool: 50 concurrent camera checks
	const maxWorkers = 50
	ipChan := make(chan string, len(ips))
	var wg sync.WaitGroup

	// Start workers
	for i := 0; i < maxWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ip := range ipChan {
				checkAndReportCamera(scan, ip, username, password)
			}
		}()
	}

	// Feed IPs to workers
	for _, ip := range ips {
		ipChan <- ip
	}
	close(ipChan)

	// Wait for all workers to finish
	wg.Wait()
}

// checkAndReportCamera checks a single IP and reports progress
func checkAndReportCamera(scan *ActiveScan, ip, username, password string) {
	// Build request URL
	url := fmt.Sprintf("https://%s/axis-cgi/basicdeviceinfo.cgi", ip)

	// Build request body
	body := map[string]interface{}{
		"apiVersion": "1.0",
		"method":     "getProperties",
		"params": map[string]interface{}{
			"propertyList": []string{
				"Brand",
				"ProdType",
				"ProdNbr",
				"ProdFullName",
				"SerialNumber",
			},
		},
	}

	req := &ProxyRequest{
		URL:      url,
		Method:   "POST",
		Username: username,
		Password: password,
		Body:     body,
	}

	// Make camera request
	resp, err := makeCameraRequest(req)

	// Update scan progress
	scan.ScannedCount++
	scannedCount := scan.ScannedCount

	progress := ScanProgress{
		ScanID:       scan.ID,
		IP:           ip,
		ScannedCount: scannedCount,
		TotalIPs:     scan.TotalIPs,
		CamerasFound: scan.CamerasFound,
		PercentDone:  float64(scannedCount) / float64(scan.TotalIPs) * 100.0,
		IsComplete:   false,
	}

	if err != nil {
		// Not a camera or error - don't report
		logger.Printf("[Scan %s] %s: not a camera (%v)", scan.ID, ip, err)
	} else if resp.Status == 200 {
		// Parse camera data
		data := resp.Data["data"].(map[string]interface{})
		propertyList := data["propertyList"].(map[string]interface{})

		// Check if it's an Axis device
		brand, _ := propertyList["Brand"].(string)
		if brand == "AXIS" {
			// Get device type from product number
			prodNbr, _ := propertyList["ProdNbr"].(string)
			deviceType := getDeviceType(prodNbr)

			if deviceType == "camera" {
				scan.CamerasFound++

				progress.CamerasFound = scan.CamerasFound
				progress.Camera = map[string]interface{}{
					"ip":           ip,
					"manufacturer": brand,
					"model":        propertyList["ProdFullName"],
					"serialNumber": propertyList["SerialNumber"],
					"productNumber": prodNbr,
					"deviceType":   deviceType,
				}

				logger.Printf("[Scan %s] ✅ Found camera at %s: %s", scan.ID, ip, propertyList["ProdFullName"])
			}
		}
	}

	// Send progress update
	select {
	case scan.ProgressChan <- progress:
	default:
		// Channel full, skip this update
	}
}

// getDeviceType determines device type from product number
func getDeviceType(prodNbr string) string {
	if len(prodNbr) == 0 {
		return "unknown"
	}

	prefix := string(prodNbr[0])
	switch prefix {
	case "M", "P", "Q":
		return "camera"
	case "C":
		return "speaker"
	case "I":
		return "intercom"
	case "A":
		return "access-control"
	default:
		return "unknown"
	}
}

// handleScanResults handles WebSocket connections for scan progress
func handleScanResults(w http.ResponseWriter, r *http.Request) {
	scanID := r.URL.Query().Get("scan_id")
	if scanID == "" {
		http.Error(w, "scan_id required", http.StatusBadRequest)
		return
	}

	activeScansMu.RLock()
	scan, exists := activeScans[scanID]
	activeScansMu.RUnlock()

	if !exists {
		http.Error(w, "Scan not found", http.StatusNotFound)
		return
	}

	// Upgrade to WebSocket
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	// Register client
	scan.ClientsMu.Lock()
	scan.Clients[conn] = true
	scan.ClientsMu.Unlock()

	logger.Printf("Client connected to scan %s", scanID)

	// Unregister on disconnect
	defer func() {
		scan.ClientsMu.Lock()
		delete(scan.Clients, conn)
		scan.ClientsMu.Unlock()
		logger.Printf("Client disconnected from scan %s", scanID)
	}()

	// Stream progress updates
	for progress := range scan.ProgressChan {
		if err := conn.WriteJSON(progress); err != nil {
			logger.Printf("Error sending progress: %v", err)
			break
		}

		// Close connection after completion message
		if progress.IsComplete {
			break
		}
	}
}
