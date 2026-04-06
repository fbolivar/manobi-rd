package capture

import (
	"bytes"
	"encoding/base64"
	"image/jpeg"
	"log"
	"time"

	"github.com/kbinani/screenshot"
	"manobi-agent/ws"
)

// StartStreaming captura la pantalla y envía frames via WebSocket
func StartStreaming(client *ws.Client, sessionID string) {
	log.Printf("Iniciando captura de pantalla para sesión %s", sessionID)

	ticker := time.NewTicker(100 * time.Millisecond) // ~10 FPS
	defer ticker.Stop()

	for range ticker.C {
		frame, err := captureScreen()
		if err != nil {
			log.Printf("Error capturando pantalla: %v", err)
			continue
		}

		client.Send("screen:frame", map[string]interface{}{
			"sessionId": sessionID,
			"frame":     frame,
			"timestamp": time.Now().UnixMilli(),
		})
	}
}

func captureScreen() (string, error) {
	// Capturar pantalla principal
	bounds := screenshot.GetDisplayBounds(0)
	img, err := screenshot.CaptureRect(bounds)
	if err != nil {
		return "", err
	}

	// Comprimir como JPEG
	var buf bytes.Buffer
	err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 50})
	if err != nil {
		return "", err
	}

	// Codificar en base64
	return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

// GetScreenSize retorna el tamaño de la pantalla principal
func GetScreenSize() (int, int) {
	bounds := screenshot.GetDisplayBounds(0)
	return bounds.Dx(), bounds.Dy()
}
