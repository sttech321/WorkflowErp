package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Invoice struct {
	ID           uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	Number       string    `gorm:"uniqueIndex;size:100;not null" json:"number"`
	CustomerName string    `gorm:"size:255;not null" json:"customerName"`
	Amount       float64   `gorm:"type:decimal(12,2);not null" json:"amount"`
	Status       string    `gorm:"size:50;not null" json:"status"`
	IssuedAt     time.Time `json:"issuedAt"`
	DueAt        time.Time `json:"dueAt"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (i *Invoice) BeforeCreate(tx *gorm.DB) error {
	if i.ID == uuid.Nil {
		i.ID = uuid.New()
	}
	return nil
}
