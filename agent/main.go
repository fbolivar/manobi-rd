package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"

	"manobi-agent/capture"
	"manobi-agent/input"
	"manobi-agent/ws"
)

// Configuración del agente
type Config struct {
	ServerURL string `json:"server_url"`
	Token     string `json:"token"`
}

var (
	serverURL = flag.String("server", "ws://localhost:3001", "URL del servidor Manobi-RD")
	configFile = flag.String("config", "", "Archivo de configuración")
)

func main() {
	flag.Parse()

	log.Println("╔══════════════════════════════════════╗")
	log.Println("║      Manobi-RD Agente v1.0           ║")
	log.Println("║      BC Fabric SAS - Colombia        ║")
	log.Println("╚══════════════════════════════════════╝")

	// Cargar configuración
	config := loadConfig()

	// Registrar el dispositivo
	deviceInfo := getDeviceInfo()
	log.Printf("Dispositivo: %s (%s)", deviceInfo["hostname"], deviceInfo["sistema_operativo"])

	// Conectar al servidor
	client := ws.NewClient(config.ServerURL, config.Token)

	// Registrar handlers
	client.OnMessage("control:solicitud", handleControlRequest(client))
	client.OnMessage("input:mouse", input.HandleMouse)
	client.OnMessage("input:teclado", input.HandleKeyboard)
	client.OnMessage("webrtc:offer", handleWebRTCOffer(client))

	// Conectar
	go func() {
		for {
			err := client.Connect(deviceInfo)
			if err != nil {
				log.Printf("Error de conexión: %v. Reintentando en 5s...", err)
				time.Sleep(5 * time.Second)
				continue
			}
			break
		}
	}()

	// Heartbeat
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			client.Send("heartbeat", map[string]interface{}{
				"usuario_actual": getCurrentUser(),
			})
		}
	}()

	// Esperar señal de terminación
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Agente detenido")
	client.Close()
}

func loadConfig() Config {
	config := Config{
		ServerURL: *serverURL,
	}

	if *configFile != "" {
		data, err := os.ReadFile(*configFile)
		if err == nil {
			json.Unmarshal(data, &config)
		}
	}

	// Buscar config en ubicación estándar
	if config.Token == "" {
		var configPath string
		if runtime.GOOS == "windows" {
			configPath = "C:\\ProgramData\\ManobiRD\\config.json"
		} else {
			configPath = "/etc/manobi-rd/config.json"
		}

		data, err := os.ReadFile(configPath)
		if err == nil {
			json.Unmarshal(data, &config)
		}
	}

	return config
}

func getDeviceInfo() map[string]interface{} {
	hostname, _ := os.Hostname()
	osType := runtime.GOOS

	// Mapear a nuestros tipos
	sistemaOp := "linux"
	if osType == "windows" {
		sistemaOp = "windows"
	} else if osType == "darwin" {
		sistemaOp = "macos"
	}

	return map[string]interface{}{
		"nombre":             hostname,
		"hostname":           hostname,
		"sistema_operativo":  sistemaOp,
		"version_so":         getOSVersion(),
		"usuario_actual":     getCurrentUser(),
		"cpu_info":           getCPUInfo(),
		"ram_total_mb":       getRAMTotal(),
		"direccion_ip":       getLocalIP(),
		"direccion_mac":      getMAC(),
		"en_dominio":         isDomainJoined(),
		"nombre_dominio":     getDomainName(),
	}
}

func handleControlRequest(client *ws.Client) func(json.RawMessage) {
	return func(data json.RawMessage) {
		var req struct {
			SessionID string `json:"sessionId"`
			UserID    string `json:"userId"`
		}
		json.Unmarshal(data, &req)

		log.Printf("Solicitud de control remoto - Sesión: %s", req.SessionID)

		// Iniciar captura de pantalla
		go capture.StartStreaming(client, req.SessionID)
	}
}

func handleWebRTCOffer(client *ws.Client) func(json.RawMessage) {
	return func(data json.RawMessage) {
		var offer struct {
			Offer     json.RawMessage `json:"offer"`
			SessionID string          `json:"sessionId"`
			From      string          `json:"from"`
		}
		json.Unmarshal(data, &offer)

		log.Printf("Oferta WebRTC recibida - Sesión: %s", offer.SessionID)

		// En producción aquí se crearía el peer WebRTC nativo
		// Por ahora respondemos con una señal de aceptación
		client.Send("webrtc:answer", map[string]interface{}{
			"targetId":  offer.From,
			"sessionId": offer.SessionID,
			"answer":    offer.Offer, // Placeholder
		})
	}
}

// Funciones auxiliares del sistema
func getCurrentUser() string {
	if u := os.Getenv("USER"); u != "" {
		return u
	}
	if u := os.Getenv("USERNAME"); u != "" {
		return u
	}
	return "desconocido"
}

func getOSVersion() string {
	if runtime.GOOS == "windows" {
		return "Windows"
	}
	data, err := os.ReadFile("/etc/os-release")
	if err != nil {
		return runtime.GOOS
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "PRETTY_NAME=") {
			return strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), "\"")
		}
	}
	return runtime.GOOS
}

func getCPUInfo() string {
	return fmt.Sprintf("%s/%d cores", runtime.GOARCH, runtime.NumCPU())
}

func getRAMTotal() int {
	// Simplificado - en producción usar gopsutil
	return 0
}

func getLocalIP() string {
	return ""
}

func getMAC() string {
	return ""
}

func isDomainJoined() bool {
	return os.Getenv("USERDOMAIN") != "" && os.Getenv("USERDOMAIN") != os.Getenv("COMPUTERNAME")
}

func getDomainName() string {
	domain := os.Getenv("USERDOMAIN")
	if domain == os.Getenv("COMPUTERNAME") {
		return ""
	}
	return domain
}

// Usamos la URL para construir la WebSocket URL
func init() {
	_ = url.URL{}
}
