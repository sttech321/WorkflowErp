package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID           uuid.UUID  `gorm:"type:char(36);primaryKey" json:"id"`
	Email        string     `gorm:"uniqueIndex;size:255;not null" json:"email"`
	PasswordHash string     `gorm:"size:255;not null" json:"-"`
	Name         string     `gorm:"size:255;not null" json:"name"`
	Role         string     `gorm:"size:50;not null" json:"role"`
	AvatarURL    string     `gorm:"size:2048" json:"avatarUrl,omitempty"`
	EmployeeID   *uuid.UUID `gorm:"type:char(36);index" json:"employeeId,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}
