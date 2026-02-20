package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"erp-backend/internal/middleware"
	"erp-backend/internal/models"
)

type AttendanceHandler struct {
	DB *gorm.DB
}

const maxShiftHours = 14

func parseAdminTime(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, nil
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed, nil
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed, nil
	}
	localFormats := []string{
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
	}
	for _, format := range localFormats {
		parsed, err := time.ParseInLocation(format, value, time.Local)
		if err == nil {
			return parsed, nil
		}
	}
	if parsed, err := time.Parse("15:04", value); err == nil {
		now := time.Now()
		return time.Date(now.Year(), now.Month(), now.Day(), parsed.Hour(), parsed.Minute(), 0, 0, now.Location()), nil
	}
	return time.Time{}, fmt.Errorf("invalid time format")
}

type checkInRequest struct {
	EmployeeID string `json:"employeeId"`
	CheckInAt  string `json:"checkInAt"`
}

type checkOutRequest struct {
	AttendanceID string `json:"attendanceId"`
	EmployeeID   string `json:"employeeId"`
	CheckOutAt   string `json:"checkOutAt"`
}

type breakRequest struct {
	AttendanceID string `json:"attendanceId"`
	EmployeeID   string `json:"employeeId"`
}

type manualBreakRequest struct {
	AttendanceID string `json:"attendanceId" binding:"required"`
	BreakStartAt string `json:"breakStartAt" binding:"required"`
	BreakEndAt   string `json:"breakEndAt" binding:"required"`
}

func NewAttendanceHandler(db *gorm.DB) *AttendanceHandler {
	return &AttendanceHandler{DB: db}
}

func (h *AttendanceHandler) findOpenAttendance(c *gin.Context, attendanceID string, employeeID string) (models.Attendance, error) {
	var record models.Attendance

	role, _ := c.Get(middleware.ContextRole)
	if role == "employee" {
		contextEmployeeID, ok := c.Get(middleware.ContextEmployeeID)
		if !ok || contextEmployeeID == "" {
			return record, gorm.ErrRecordNotFound
		}
		employeeID = contextEmployeeID.(string)
		attendanceID = ""
	}

	if attendanceID != "" {
		parsedID, err := uuid.Parse(attendanceID)
		if err != nil {
			return record, err
		}
		if err := h.DB.Preload("Breaks", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at asc")
		}).First(&record, "id = ?", parsedID).Error; err != nil {
			return record, err
		}
		if record.CheckOut != nil {
			return record, gorm.ErrRecordNotFound
		}
		return record, nil
	}

	if employeeID == "" {
		return record, gorm.ErrRecordNotFound
	}
	parsedEmployeeID, err := uuid.Parse(employeeID)
	if err != nil {
		return record, err
	}
	if err := h.DB.Preload("Breaks", func(db *gorm.DB) *gorm.DB {
		return db.Order("created_at asc")
	}).Where("employee_id = ? AND check_out IS NULL", parsedEmployeeID).
		Order("created_at desc").First(&record).Error; err != nil {
		return record, err
	}
	return record, nil
}

func (h *AttendanceHandler) List(c *gin.Context) {
	role, _ := c.Get(middleware.ContextRole)
	if role == "employee" {
		employeeID, ok := c.Get(middleware.ContextEmployeeID)
		if !ok || employeeID == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		id, err := uuid.Parse(employeeID.(string))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid employeeId"})
			return
		}
		h.closeExpiredAttendance(&id)
		var records []models.Attendance
		if err := h.DB.Preload("Breaks", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at asc")
		}).Where("employee_id = ?", id).Order("created_at desc").Find(&records).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load attendance"})
			return
		}
		c.JSON(http.StatusOK, records)
		return
	}

	h.closeExpiredAttendance(nil)
	var records []models.Attendance
	if err := h.DB.Preload("Breaks", func(db *gorm.DB) *gorm.DB {
		return db.Order("created_at asc")
	}).Order("created_at desc").Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load attendance"})
		return
	}
	c.JSON(http.StatusOK, records)
}

func (h *AttendanceHandler) CheckIn(c *gin.Context) {
	var req checkInRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	role, _ := c.Get(middleware.ContextRole)
	if role == "employee" {
		employeeID, ok := c.Get(middleware.ContextEmployeeID)
		if !ok || employeeID == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		req.EmployeeID = employeeID.(string)
	} else if req.EmployeeID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "employeeId required"})
		return
	}

	employeeID, err := uuid.Parse(req.EmployeeID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid employeeId"})
		return
	}

	checkInTime := time.Now()
	if role != "employee" && req.CheckInAt != "" {
		parsed, err := parseAdminTime(req.CheckInAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid checkInAt"})
			return
		}
		if parsed.After(time.Now()) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "checkInAt cannot be in the future"})
			return
		}
		checkInTime = parsed
	}

	var openRecord models.Attendance
	if err := h.DB.Where("employee_id = ? AND check_out IS NULL", employeeID).
		Order("created_at desc").First(&openRecord).Error; err == nil {
		if !h.autoCloseIfExpired(&openRecord) {
			c.JSON(http.StatusConflict, gin.H{"error": "open attendance exists"})
			return
		}
	} else if err != nil && err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "checkin failed"})
		return
	}

	if role == "employee" {
		dayStart := time.Date(checkInTime.Year(), checkInTime.Month(), checkInTime.Day(), 0, 0, 0, 0, checkInTime.Location())
		dayEnd := dayStart.Add(24 * time.Hour)
		var dayCount int64
		if err := h.DB.Model(&models.Attendance{}).
			Where("employee_id = ? AND check_in >= ? AND check_in < ?", employeeID, dayStart, dayEnd).
			Count(&dayCount).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "checkin failed"})
			return
		}
		if dayCount > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "already checked in for this day"})
			return
		}
	}

	record := models.Attendance{
		EmployeeID: employeeID,
		CheckIn:    checkInTime,
	}

	if err := h.DB.Create(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "checkin failed"})
		return
	}

	c.JSON(http.StatusCreated, record)
}

func (h *AttendanceHandler) CheckOut(c *gin.Context) {
	var req checkOutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	role, _ := c.Get(middleware.ContextRole)

	var record models.Attendance
	var err error
	record, err = h.findOpenAttendance(c, req.AttendanceID, req.EmployeeID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "open attendance not found"})
			return
		}
		if _, parseErr := uuid.Parse(req.AttendanceID); req.AttendanceID != "" && parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attendanceId"})
			return
		}
		if _, parseErr := uuid.Parse(req.EmployeeID); req.EmployeeID != "" && parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid employeeId"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "checkout failed"})
		return
	}

	if record.CheckOut != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "already checked out"})
		return
	}

	if role == "employee" {
		employeeID, _ := c.Get(middleware.ContextEmployeeID)
		if employeeID != nil && record.EmployeeID.String() != employeeID.(string) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
	}

	checkOutTime := time.Now()
	if role != "employee" && req.CheckOutAt != "" {
		parsed, err := parseAdminTime(req.CheckOutAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid checkOutAt"})
			return
		}
		if parsed.After(time.Now()) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "checkOutAt cannot be in the future"})
			return
		}
		checkOutTime = parsed
	}
	if checkOutTime.Before(record.CheckIn) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "checkOutAt cannot be before checkIn"})
		return
	}
	maxClose := record.CheckIn.Add(time.Duration(maxShiftHours) * time.Hour)
	if checkOutTime.After(maxClose) {
		checkOutTime = maxClose
	}

	for index := range record.Breaks {
		if record.Breaks[index].BreakEnd == nil {
			record.Breaks[index].BreakEnd = &checkOutTime
			_ = h.DB.Save(&record.Breaks[index]).Error
			continue
		}
		if record.Breaks[index].BreakEnd.After(checkOutTime) {
			record.Breaks[index].BreakEnd = &checkOutTime
			_ = h.DB.Save(&record.Breaks[index]).Error
		}
	}

	record.CheckOut = &checkOutTime
	if err := h.DB.Save(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "checkout failed"})
		return
	}

	if err := h.DB.Preload("Breaks", func(db *gorm.DB) *gorm.DB {
		return db.Order("created_at asc")
	}).First(&record, "id = ?", record.ID).Error; err != nil {
		c.JSON(http.StatusOK, record)
		return
	}

	c.JSON(http.StatusOK, record)
}

func (h *AttendanceHandler) BreakStart(c *gin.Context) {
	var req breakRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	record, err := h.findOpenAttendance(c, req.AttendanceID, req.EmployeeID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "open attendance not found"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attendance request"})
		return
	}

	for _, br := range record.Breaks {
		if br.BreakEnd == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "break already active"})
			return
		}
	}

	now := time.Now()
	if now.Before(record.CheckIn) {
		now = record.CheckIn
	}
	if record.CheckOut != nil && now.After(*record.CheckOut) {
		now = *record.CheckOut
	}

	newBreak := models.AttendanceBreak{
		AttendanceID: record.ID,
		BreakStart:   now,
	}
	if err := h.DB.Create(&newBreak).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "break start failed"})
		return
	}

	c.JSON(http.StatusCreated, newBreak)
}

func (h *AttendanceHandler) BreakEnd(c *gin.Context) {
	var req breakRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	record, err := h.findOpenAttendance(c, req.AttendanceID, req.EmployeeID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "open attendance not found"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attendance request"})
		return
	}

	var openBreak models.AttendanceBreak
	if err := h.DB.Where("attendance_id = ? AND break_end IS NULL", record.ID).
		Order("created_at desc").First(&openBreak).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "no active break"})
		return
	}

	now := time.Now()
	if now.Before(openBreak.BreakStart) {
		now = openBreak.BreakStart
	}
	openBreak.BreakEnd = &now
	if err := h.DB.Save(&openBreak).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "break end failed"})
		return
	}

	c.JSON(http.StatusOK, openBreak)
}

func (h *AttendanceHandler) AddManualBreak(c *gin.Context) {
	role, _ := c.Get(middleware.ContextRole)
	if role != "admin" && role != "manager" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var req manualBreakRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	attendanceID, err := uuid.Parse(req.AttendanceID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attendanceId"})
		return
	}

	breakStart, err := parseAdminTime(req.BreakStartAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid breakStartAt"})
		return
	}
	breakEnd, err := parseAdminTime(req.BreakEndAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid breakEndAt"})
		return
	}
	if !breakEnd.After(breakStart) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "breakEndAt must be after breakStartAt"})
		return
	}

	var record models.Attendance
	if err := h.DB.Preload("Breaks", func(db *gorm.DB) *gorm.DB {
		return db.Order("created_at asc")
	}).First(&record, "id = ?", attendanceID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "attendance not found"})
		return
	}

	if breakStart.Before(record.CheckIn) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "break cannot start before check-in"})
		return
	}

	latestAllowed := time.Now()
	if record.CheckOut != nil {
		latestAllowed = *record.CheckOut
	}
	if breakEnd.After(latestAllowed) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "break cannot end after shift end"})
		return
	}

	for _, existing := range record.Breaks {
		if existing.BreakEnd == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "active break exists, end it first"})
			return
		}
		existingEnd := *existing.BreakEnd
		if breakStart.Before(existingEnd) && breakEnd.After(existing.BreakStart) {
			c.JSON(http.StatusConflict, gin.H{"error": "break overlaps existing break"})
			return
		}
	}

	newBreak := models.AttendanceBreak{
		AttendanceID: record.ID,
		BreakStart:   breakStart,
		BreakEnd:     &breakEnd,
	}
	if err := h.DB.Create(&newBreak).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "manual break add failed"})
		return
	}

	c.JSON(http.StatusCreated, newBreak)
}

func (h *AttendanceHandler) autoCloseIfExpired(record *models.Attendance) bool {
	if record.CheckOut != nil {
		return true
	}
	maxClose := record.CheckIn.Add(time.Duration(maxShiftHours) * time.Hour)
	if time.Now().After(maxClose) {
		var breaks []models.AttendanceBreak
		if err := h.DB.Where("attendance_id = ? AND break_end IS NULL", record.ID).Find(&breaks).Error; err == nil {
			for index := range breaks {
				breaks[index].BreakEnd = &maxClose
				_ = h.DB.Save(&breaks[index]).Error
			}
		}
		record.CheckOut = &maxClose
		if err := h.DB.Save(record).Error; err != nil {
			return false
		}
		return true
	}
	return false
}

func (h *AttendanceHandler) closeExpiredAttendance(employeeID *uuid.UUID) {
	cutoff := time.Now().Add(-time.Duration(maxShiftHours) * time.Hour)
	query := h.DB.Where("check_out IS NULL AND check_in <= ?", cutoff)
	if employeeID != nil {
		query = query.Where("employee_id = ?", *employeeID)
	}
	var records []models.Attendance
	if err := query.Find(&records).Error; err != nil {
		return
	}
	for i := range records {
		maxClose := records[i].CheckIn.Add(time.Duration(maxShiftHours) * time.Hour)
		var breaks []models.AttendanceBreak
		if err := h.DB.Where("attendance_id = ? AND break_end IS NULL", records[i].ID).Find(&breaks).Error; err == nil {
			for index := range breaks {
				breaks[index].BreakEnd = &maxClose
				_ = h.DB.Save(&breaks[index]).Error
			}
		}
		records[i].CheckOut = &maxClose
		if err := h.DB.Save(&records[i]).Error; err != nil {
			return
		}
	}
}

func (h *AttendanceHandler) Delete(c *gin.Context) {
	role, _ := c.Get(middleware.ContextRole)
	if role == "employee" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	attendanceID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.DB.Delete(&models.Attendance{}, "id = ?", attendanceID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *AttendanceHandler) DeleteByEmployee(c *gin.Context) {
	role, _ := c.Get(middleware.ContextRole)
	if role == "employee" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	employeeID, err := uuid.Parse(c.Param("employeeId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid employeeId"})
		return
	}

	if err := h.DB.Where("employee_id = ?", employeeID).Delete(&models.Attendance{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
