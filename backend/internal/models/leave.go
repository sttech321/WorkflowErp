package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type LeaveBalance struct {
	ID         uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	EmployeeID uuid.UUID `gorm:"type:char(36);index;not null" json:"employeeId"`
	Year       int       `gorm:"index;not null" json:"year"`
	Type       string    `gorm:"size:50;index;not null" json:"type"`
	Total      float64   `gorm:"type:decimal(6,2);not null" json:"total"`
	Used       float64   `gorm:"type:decimal(6,2);not null" json:"used"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func (b *LeaveBalance) BeforeCreate(tx *gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}

type LeaveRequest struct {
	ID         uuid.UUID  `gorm:"type:char(36);primaryKey" json:"id"`
	EmployeeID uuid.UUID  `gorm:"type:char(36);index;not null" json:"employeeId"`
	Type       string     `gorm:"size:50;index;not null" json:"type"`
	StartDate  time.Time  `gorm:"index;not null" json:"startDate"`
	EndDate    time.Time  `gorm:"index;not null" json:"endDate"`
	Days       float64    `gorm:"type:decimal(6,2);not null" json:"days"`
	Reason     string     `gorm:"size:500" json:"reason"`
	Status     string     `gorm:"size:20;index;not null" json:"status"`
	ApproverID *uuid.UUID `gorm:"type:char(36)" json:"approverId,omitempty"`
	ApprovedAt *time.Time `json:"approvedAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

func (r *LeaveRequest) BeforeCreate(tx *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

type LeavePolicy struct {
	ID        uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	Year      int       `gorm:"index;not null" json:"year"`
	Type      string    `gorm:"size:50;index;not null" json:"type"`
	Total     float64   `gorm:"type:decimal(6,2);not null" json:"total"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (p *LeavePolicy) BeforeCreate(tx *gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}
