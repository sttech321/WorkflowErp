package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"erp-backend/internal/models"
)

type DashboardHandler struct {
	DB *gorm.DB
}

func NewDashboardHandler(db *gorm.DB) *DashboardHandler {
	return &DashboardHandler{DB: db}
}

func (h *DashboardHandler) Get(c *gin.Context) {
	var employeeCount int64
	_ = h.DB.Model(&models.Employee{}).Count(&employeeCount).Error

	var invoiceCount int64
	_ = h.DB.Model(&models.Invoice{}).Count(&invoiceCount).Error

	var revenue float64
	_ = h.DB.Model(&models.Invoice{}).Where("status = ?", "paid").Select("COALESCE(SUM(amount),0)").Scan(&revenue).Error

	startOfDay := time.Now().Truncate(24 * time.Hour)
	var todayAttendance int64
	_ = h.DB.Model(&models.Attendance{}).Where("created_at >= ?", startOfDay).Count(&todayAttendance).Error

	c.JSON(http.StatusOK, gin.H{
		"employees":       employeeCount,
		"invoices":        invoiceCount,
		"revenue":         revenue,
		"todayAttendance": todayAttendance,
		"currency":        "USD",
	})
}
