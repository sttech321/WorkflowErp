package db

import (
	"erp-backend/internal/models"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func Open(dsn string) (*gorm.DB, error) {
	database, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	if err := database.AutoMigrate(
		&models.User{},
		&models.Setting{},
		&models.OTP{},
		&models.RefreshToken{},
		&models.Employee{},
		&models.Invoice{},
		&models.Attendance{},
		&models.AttendanceBreak{},
		&models.LeaveBalance{},
		&models.LeavePolicy{},
		&models.LeaveRequest{},
	); err != nil {
		return nil, err
	}

	return database, nil
}
