package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"
)

func main() {
	cameraURL := "https://192.168.50.156/axis-cgi/basicdeviceinfo.cgi"

	fmt.Println("=== HTTPS Connection Test ===")
	fmt.Println()

	// Test 1: Default HTTP client (same as proxy currently uses)
	fmt.Println("Test 1: Default HTTP Client with InsecureSkipVerify")
	client1 := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
		Timeout: 10 * time.Second,
	}

	resp, err := client1.Get(cameraURL)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
	} else {
		fmt.Printf("✅ SUCCESS: HTTP %d\n", resp.StatusCode)
		resp.Body.Close()
	}
	fmt.Println()

	// Test 2: HTTP client with explicit interface binding
	fmt.Println("Test 2: HTTP Client with Forced Interface Binding")
	dialer := &net.Dialer{
		LocalAddr: &net.TCPAddr{
			IP: net.ParseIP("192.168.50.239"),
		},
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	client2 := &http.Client{
		Transport: &http.Transport{
			DialContext: dialer.DialContext,
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
		Timeout: 10 * time.Second,
	}

	resp2, err := client2.Get(cameraURL)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
	} else {
		fmt.Printf("✅ SUCCESS: HTTP %d\n", resp2.StatusCode)
		resp2.Body.Close()
	}
	fmt.Println()

	// Test 3: Try POST with JSON body (exactly like the proxy does)
	fmt.Println("Test 3: POST Request with JSON Body (exactly like proxy)")

	req, err := http.NewRequest("POST", cameraURL, nil)
	if err != nil {
		fmt.Printf("❌ Failed to create request: %v\n", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp3, err := client1.Do(req)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		fmt.Println("\n🔍 Detailed Error Analysis:")
		if netErr, ok := err.(net.Error); ok {
			fmt.Printf("   Is timeout: %v\n", netErr.Timeout())
			fmt.Printf("   Is temporary: %v\n", netErr.Temporary())
		}
	} else {
		body, _ := io.ReadAll(resp3.Body)
		fmt.Printf("✅ SUCCESS: HTTP %d\n", resp3.StatusCode)
		fmt.Printf("   Body: %s\n", string(body))
		resp3.Body.Close()
	}

	fmt.Println("\n📝 Conclusion:")
	fmt.Println("   If Test 1 passes, the proxy SHOULD work.")
	fmt.Println("   If Test 1 fails but Test 2 passes, we need to force interface binding.")
	fmt.Println("   If all tests fail, there may be a firewall or routing issue.")
}
