package ws

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Client struct {
	serverURL string
	token     string
	conn      *websocket.Conn
	handlers  map[string]func(json.RawMessage)
	mu        sync.Mutex
	done      chan struct{}
}

type SocketMessage struct {
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}

func NewClient(serverURL, token string) *Client {
	return &Client{
		serverURL: serverURL,
		token:     token,
		handlers:  make(map[string]func(json.RawMessage)),
		done:      make(chan struct{}),
	}
}

func (c *Client) OnMessage(event string, handler func(json.RawMessage)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.handlers[event] = handler
}

func (c *Client) Connect(deviceInfo map[string]interface{}) error {
	u, err := url.Parse(c.serverURL)
	if err != nil {
		return fmt.Errorf("URL inválida: %v", err)
	}

	// Cambiar scheme a ws
	if u.Scheme == "http" {
		u.Scheme = "ws"
	} else if u.Scheme == "https" {
		u.Scheme = "wss"
	}
	u.Path = "/socket.io/"

	header := http.Header{}
	if c.token != "" {
		header.Set("Authorization", fmt.Sprintf("Bearer %s", c.token))
	}

	log.Printf("Conectando a %s...", u.String())

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), header)
	if err != nil {
		return fmt.Errorf("error conectando: %v", err)
	}

	c.conn = conn
	log.Println("✅ Conectado al servidor Manobi-RD")

	// Registrar dispositivo
	c.Send("dispositivo:registrar", deviceInfo)

	// Escuchar mensajes
	go c.listen()

	return nil
}

func (c *Client) listen() {
	defer func() {
		c.conn.Close()
		close(c.done)
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("Error leyendo mensaje: %v", err)
			// Intentar reconectar
			go c.reconnect()
			return
		}

		var msg SocketMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		c.mu.Lock()
		handler, ok := c.handlers[msg.Event]
		c.mu.Unlock()

		if ok {
			go handler(msg.Data)
		}
	}
}

func (c *Client) reconnect() {
	for i := 0; i < 10; i++ {
		log.Printf("Reintentando conexión (%d/10)...", i+1)
		time.Sleep(5 * time.Second)

		err := c.Connect(nil)
		if err == nil {
			return
		}
	}
	log.Println("No se pudo reconectar después de 10 intentos")
}

func (c *Client) Send(event string, data interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return fmt.Errorf("no conectado")
	}

	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}

	msg := SocketMessage{
		Event: event,
		Data:  payload,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	return c.conn.WriteMessage(websocket.TextMessage, msgBytes)
}

func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn != nil {
		c.conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		c.conn.Close()
	}
}
