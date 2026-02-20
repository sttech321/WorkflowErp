package models

import "time"

type OTP struct {
	ID        uint      `gorm:"primaryKey"`
	Email     string    `gorm:"index;size:255;not null"`
	CodeHash  string    `gorm:"size:255;not null"`
	ExpiresAt time.Time `gorm:"index"`
	UsedAt    *time.Time
	CreatedAt time.Time
}
