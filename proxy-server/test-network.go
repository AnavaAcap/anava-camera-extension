package main

import (
	"fmt"
	"net"
	"time"
)

func main() {
	cameraIP := "192.168.50.156:443"

	fmt.Println("=== Network Binding Test ===")
	fmt.Println()

	// Test 1: Default dial
	fmt.Println("Test 1: Default Dial (let OS choose interface)")
	conn, err := net.DialTimeout("tcp", cameraIP, 5*time.Second)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
	} else {
		localAddr := conn.LocalAddr().(*net.TCPAddr)
		fmt.Printf("✅ SUCCESS\n")
		fmt.Printf("   Local IP used: %s\n", localAddr.IP)
		fmt.Printf("   Local port: %d\n", localAddr.Port)
		conn.Close()
	}
	fmt.Println()

	// Test 2: Force binding to 192.168.50.239
	fmt.Println("Test 2: Force Bind to 192.168.50.239 (correct interface)")
	dialer := &net.Dialer{
		LocalAddr: &net.TCPAddr{
			IP: net.ParseIP("192.168.50.239"),
		},
		Timeout: 5 * time.Second,
	}
	conn2, err := dialer.Dial("tcp", cameraIP)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
	} else {
		localAddr := conn2.LocalAddr().(*net.TCPAddr)
		fmt.Printf("✅ SUCCESS\n")
		fmt.Printf("   Local IP used: %s\n", localAddr.IP)
		fmt.Printf("   Local port: %d\n", localAddr.Port)
		conn2.Close()
	}
	fmt.Println()

	// Test 3: Show all available interfaces
	fmt.Println("Test 3: Available Network Interfaces")
	interfaces, err := net.Interfaces()
	if err != nil {
		fmt.Printf("Error getting interfaces: %v\n", err)
		return
	}

	for _, iface := range interfaces {
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			// Only show IPv4 addresses in 192.168.x.x range
			if ipnet, ok := addr.(*net.IPNet); ok {
				ip := ipnet.IP.To4()
				if ip != nil && ip[0] == 192 && ip[1] == 168 {
					fmt.Printf("   %s: %s\n", iface.Name, ip)
				}
			}
		}
	}
}
