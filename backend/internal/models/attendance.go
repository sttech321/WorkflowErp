package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Attendance struct {
	ID         uuid.UUID         `gorm:"type:char(36);primaryKey" json:"id"`
	EmployeeID uuid.UUID         `gorm:"type:char(36);index;not null" json:"employeeId"`
	CheckIn    time.Time         `gorm:"not null" json:"checkIn"`
	CheckOut   *time.Time        `json:"checkOut,omitempty"`
	Breaks     []AttendanceBreak `gorm:"foreignKey:AttendanceID;constraint:OnDelete:CASCADE" json:"breaks,omitempty"`
	CreatedAt  time.Time         `json:"createdAt"`
}

func (a *Attendance) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}
