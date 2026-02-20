package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Employee struct {
	ID        uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	FirstName string    `gorm:"size:120;not null" json:"firstName"`
	LastName  string    `gorm:"size:120;not null" json:"lastName"`
	Email     string    `gorm:"uniqueIndex;size:255;not null" json:"email"`
	Role      string    `gorm:"size:50;not null;default:employee" json:"role"`
	Phone     string    `gorm:"size:50" json:"phone"`
	Position  string    `gorm:"size:120" json:"position"`
	Salary    float64   `gorm:"type:decimal(12,2)" json:"salary"`
	HiredAt   time.Time `json:"hiredAt"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (e *Employee) BeforeCreate(tx *gorm.DB) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	return nil
}
