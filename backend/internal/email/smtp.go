package email

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
)

type Config struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

func SendOTP(cfg Config, to string, code string) error {
	subject := "Your WorkFlow ERP OTP Code"
	body := "Your OTP code is: " + code + "\nThis code expires soon."
	message := buildMessage(cfg.From, to, subject, body)

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	fromAddr := parseAddress(cfg.From)
	auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)

	client, err := smtpClient(addr, cfg.Host, cfg.Port)
	if err != nil {
		return err
	}
	defer client.Close()

	if err := client.Auth(auth); err != nil {
		return err
	}
	if err := client.Mail(fromAddr); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write([]byte(message)); err != nil {
		_ = writer.Close()
		return err
	}
	return writer.Close()
}

func smtpClient(addr string, host string, port int) (*smtp.Client, error) {
	if port == 465 {
		conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: host})
		if err != nil {
			return nil, err
		}
		return smtp.NewClient(conn, host)
	}

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return nil, err
	}
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return nil, err
	}
	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: host}); err != nil {
			_ = client.Close()
			return nil, err
		}
	}
	return client, nil
}

func buildMessage(from string, to string, subject string, body string) string {
	headers := []string{
		"From: " + from,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		body,
	}
	return strings.Join(headers, "\r\n")
}

func parseAddress(from string) string {
	start := strings.Index(from, "<")
	end := strings.Index(from, ">")
	if start >= 0 && end > start {
		return strings.TrimSpace(from[start+1 : end])
	}
	return strings.TrimSpace(from)
}
