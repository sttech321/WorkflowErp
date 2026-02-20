package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AttendanceBreak struct {
	ID           uuid.UUID  `gorm:"type:char(36);primaryKey" json:"id"`
	AttendanceID uuid.UUID  `gorm:"type:char(36);index;not null" json:"attendanceId"`
	BreakStart   time.Time  `gorm:"not null" json:"breakStart"`
	BreakEnd     *time.Time `json:"breakEnd,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
}

func (b *AttendanceBreak) BeforeCreate(tx *gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}
