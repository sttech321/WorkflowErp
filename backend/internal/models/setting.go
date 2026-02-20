package models

import "time"

type Setting struct {
	Key       string    `gorm:"size:64;primaryKey" json:"key"`
	Value     string    `gorm:"type:longtext" json:"value"`
	UpdatedAt time.Time `json:"updatedAt"`
}
