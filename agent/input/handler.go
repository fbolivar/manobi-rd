package input

import (
	"encoding/json"
	"log"

	"manobi-agent/capture"
)

// MouseEvent representa un evento de mouse del panel web
type MouseEvent struct {
	DeviceID string  `json:"deviceId"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Type     string  `json:"type"`
	Button   int     `json:"button"`
}

// KeyboardEvent representa un evento de teclado del panel web
type KeyboardEvent struct {
	DeviceID  string   `json:"deviceId"`
	Key       string   `json:"key"`
	Type      string   `json:"type"`
	Modifiers []string `json:"modifiers"`
}

// HandleMouse procesa eventos de mouse recibidos del servidor
func HandleMouse(data json.RawMessage) {
	var event MouseEvent
	if err := json.Unmarshal(data, &event); err != nil {
		log.Printf("Error parseando evento mouse: %v", err)
		return
	}

	// Convertir coordenadas relativas a absolutas
	screenW, screenH := capture.GetScreenSize()
	absX := int(event.X * float64(screenW))
	absY := int(event.Y * float64(screenH))

	switch event.Type {
	case "mousemove":
		moveMouse(absX, absY)
	case "click", "mousedown":
		moveMouse(absX, absY)
		clickMouse(event.Button)
	case "mouseup":
		// Mouse release
	case "dblclick":
		moveMouse(absX, absY)
		doubleClick()
	case "contextmenu":
		moveMouse(absX, absY)
		rightClick()
	}
}

// HandleKeyboard procesa eventos de teclado recibidos del servidor
func HandleKeyboard(data json.RawMessage) {
	var event KeyboardEvent
	if err := json.Unmarshal(data, &event); err != nil {
		log.Printf("Error parseando evento teclado: %v", err)
		return
	}

	if event.Type == "keydown" {
		pressKey(event.Key, event.Modifiers)
	}
}

// Funciones de bajo nivel para control de input
// En producción se usan llamadas nativas del SO

func moveMouse(x, y int) {
	log.Printf("Mouse move: %d, %d", x, y)
	// robotgo.Move(x, y) - Requiere CGO en producción
}

func clickMouse(button int) {
	log.Printf("Mouse click: button %d", button)
	// robotgo.Click("left")
}

func doubleClick() {
	log.Println("Double click")
	// robotgo.Click("left", true)
}

func rightClick() {
	log.Println("Right click")
	// robotgo.Click("right")
}

func pressKey(key string, modifiers []string) {
	log.Printf("Key press: %s (modifiers: %v)", key, modifiers)
	// robotgo.KeyTap(key, modifiers...)
}
