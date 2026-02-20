package utils

import (
	"crypto/rand"
	"encoding/base64"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type AccessClaims struct {
	Role       string `json:"role"`
	EmployeeID string `json:"employeeId,omitempty"`
	jwt.RegisteredClaims
}

func GenerateAccessToken(userID string, role string, employeeID string, secret string, minutes int) (string, error) {
	expiration := time.Now().Add(time.Duration(minutes) * time.Minute)
	claims := AccessClaims{
		Role:       role,
		EmployeeID: employeeID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(expiration),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func GenerateRefreshToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
