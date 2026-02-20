package config

import (
	"errors"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv            string
	Addr              string
	DbDsn             string
	JwtSecret         string
	JwtAccessMinutes  int
	JwtRefreshHours   int
	OtpMinutes        int
	AdminBootstrap    string
	SmtpHost          string
	SmtpPort          int
	SmtpUser          string
	SmtpPass          string
	SmtpFrom          string
	AllowedOriginsRaw string
}

func Load() (Config, error) {
	_ = godotenv.Load()

	cfg := Config{
		AppEnv:            getEnv("APP_ENV", "local"),
		Addr:              getEnv("APP_ADDR", ":8080"),
		DbDsn:             os.Getenv("DB_DSN"),
		JwtSecret:         os.Getenv("JWT_SECRET"),
		JwtAccessMinutes:  getEnvInt("JWT_ACCESS_MINUTES", 15),
		JwtRefreshHours:   getEnvInt("JWT_REFRESH_HOURS", 168),
		OtpMinutes:        getEnvInt("OTP_MINUTES", 10),
		AdminBootstrap:    os.Getenv("ADMIN_BOOTSTRAP_EMAIL"),
		SmtpHost:          os.Getenv("SMTP_HOST"),
		SmtpPort:          getEnvInt("SMTP_PORT", 587),
		SmtpUser:          os.Getenv("SMTP_USER"),
		SmtpPass:          os.Getenv("SMTP_PASS"),
		SmtpFrom:          os.Getenv("SMTP_FROM"),
		AllowedOriginsRaw: getEnv("ALLOWED_ORIGINS", ""),
	}

	missing := []string{}
	if cfg.DbDsn == "" {
		missing = append(missing, "DB_DSN")
	}
	if cfg.JwtSecret == "" {
		missing = append(missing, "JWT_SECRET")
	}
	if cfg.SmtpHost == "" {
		missing = append(missing, "SMTP_HOST")
	}
	if cfg.SmtpUser == "" {
		missing = append(missing, "SMTP_USER")
	}
	if cfg.SmtpPass == "" {
		missing = append(missing, "SMTP_PASS")
	}
	if cfg.SmtpFrom == "" {
		missing = append(missing, "SMTP_FROM")
	}

	if len(missing) > 0 {
		return cfg, errors.New("missing env: " + strings.Join(missing, ", "))
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
