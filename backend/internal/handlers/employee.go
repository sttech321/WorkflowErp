package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"erp-backend/internal/middleware"
	"erp-backend/internal/models"
	"erp-backend/internal/utils"
)

type EmployeeHandler struct {
	DB *gorm.DB
}

type createEmployeeRequest struct {
	FirstName string  `json:"firstName" binding:"required"`
	LastName  string  `json:"lastName" binding:"required"`
	Email     string  `json:"email" binding:"required,email"`
	Role      string  `json:"role"`
	Phone     string  `json:"phone"`
	Position  string  `json:"position"`
	Salary    float64 `json:"salary"`
	HiredAt   string  `json:"hiredAt" binding:"required"`
}

type createEmployeeUserRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Role     string `json:"role"`
}

type updateEmployeePasswordRequest struct {
	Password string `json:"password" binding:"required,min=6"`
}

func NewEmployeeHandler(db *gorm.DB) *EmployeeHandler {
	return &EmployeeHandler{DB: db}
}

func normalizeEmployeeRole(value string) (string, bool) {
	role := strings.ToLower(strings.TrimSpace(value))
	if role == "" {
		return "employee", true
	}
	if role == "employee" || role == "manager" {
		return role, true
	}
	return "", false
}

func (h *EmployeeHandler) List(c *gin.Context) {
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
		var employee models.Employee
		if err := h.DB.First(&employee, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "employee not found"})
			return
		}
		c.JSON(http.StatusOK, []models.Employee{employee})
		return
	}

	query := h.DB.Order("created_at desc")
	if role == "manager" {
		query = query.Where("role = ?", "employee")
	}

	var employees []models.Employee
	if err := query.Find(&employees).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load employees"})
		return
	}
	c.JSON(http.StatusOK, employees)
}

func (h *EmployeeHandler) Create(c *gin.Context) {
	actorRole, _ := c.Get(middleware.ContextRole)

	var req createEmployeeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(req.Email))
	var existing models.Employee
	if err := h.DB.Where("email = ?", normalizedEmail).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already exists"})
		return
	} else if err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create failed"})
		return
	}

	hiredAt, err := time.Parse("2006-01-02", req.HiredAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hiredAt"})
		return
	}

	role, validRole := normalizeEmployeeRole(req.Role)
	if !validRole {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}
	if actorRole == "manager" && role == "manager" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only admin can add manager"})
		return
	}

	employee := models.Employee{
		FirstName: req.FirstName,
		LastName:  req.LastName,
		Email:     normalizedEmail,
		Role:      role,
		Phone:     req.Phone,
		Position:  req.Position,
		Salary:    req.Salary,
		HiredAt:   hiredAt,
	}

	if err := h.DB.Create(&employee).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create failed"})
		return
	}

	c.JSON(http.StatusCreated, employee)
}

func (h *EmployeeHandler) Update(c *gin.Context) {
	actorRole, _ := c.Get(middleware.ContextRole)

	var req createEmployeeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	employeeID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	hiredAt, err := time.Parse("2006-01-02", req.HiredAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hiredAt"})
		return
	}

	role, validRole := normalizeEmployeeRole(req.Role)
	if !validRole {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}

	var employee models.Employee
	if err := h.DB.First(&employee, "id = ?", employeeID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "employee not found"})
		return
	}
	if actorRole == "manager" && strings.EqualFold(employee.Role, "manager") {
		c.JSON(http.StatusForbidden, gin.H{"error": "manager cannot manage manager"})
		return
	}
	if actorRole == "manager" && role == "manager" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only admin can update manager role"})
		return
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(req.Email))
	var existing models.Employee
	if err := h.DB.Where("email = ? AND id <> ?", normalizedEmail, employeeID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already exists"})
		return
	} else if err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}

	employee.FirstName = req.FirstName
	employee.LastName = req.LastName
	employee.Email = normalizedEmail
	employee.Role = role
	employee.Phone = req.Phone
	employee.Position = req.Position
	employee.Salary = req.Salary
	employee.HiredAt = hiredAt

	if err := h.DB.Save(&employee).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}

	_ = h.DB.Model(&models.User{}).
		Where("employee_id = ?", employeeID).
		Updates(map[string]any{
			"email": normalizedEmail,
			"name":  employee.FirstName + " " + employee.LastName,
			"role":  employee.Role,
		}).Error

	c.JSON(http.StatusOK, employee)
}

func (h *EmployeeHandler) Delete(c *gin.Context) {
	actorRole, _ := c.Get(middleware.ContextRole)

	employeeID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if actorRole == "manager" {
		var employee models.Employee
		if err := h.DB.First(&employee, "id = ?", employeeID).Error; err == nil {
			if strings.EqualFold(employee.Role, "manager") {
				c.JSON(http.StatusForbidden, gin.H{"error": "manager cannot manage manager"})
				return
			}
		}
	}

	var employee models.Employee
	if err := h.DB.First(&employee, "id = ?", employeeID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "employee not found"})
		return
	}
	if actorRole == "manager" && strings.EqualFold(employee.Role, "manager") {
		c.JSON(http.StatusForbidden, gin.H{"error": "manager cannot manage manager"})
		return
	}

	if err := h.DB.Delete(&models.Employee{}, "id = ?", employeeID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *EmployeeHandler) CreateUser(c *gin.Context) {
	role, _ := c.Get(middleware.ContextRole)
	if role != "admin" && role != "manager" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var req createEmployeeUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	employeeID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var employee models.Employee
	if err := h.DB.First(&employee, "id = ?", employeeID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "employee not found"})
		return
	}
	if role == "manager" && strings.EqualFold(employee.Role, "manager") {
		c.JSON(http.StatusForbidden, gin.H{"error": "manager cannot manage manager"})
		return
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(req.Email))
	var existing models.User
	if err := h.DB.Where("email = ?", normalizedEmail).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
		return
	}

	passwordHash, err := utils.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "password error"})
		return
	}

	roleName, validRole := normalizeEmployeeRole(req.Role)
	if !validRole {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}
	if role == "manager" && roleName == "manager" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only admin can add manager"})
		return
	}

	user := models.User{
		Email:        normalizedEmail,
		PasswordHash: passwordHash,
		Name:         employee.FirstName + " " + employee.LastName,
		Role:         roleName,
		EmployeeID:   &employee.ID,
	}

	if err := h.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "user creation failed"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":         user.ID,
		"email":      user.Email,
		"name":       user.Name,
		"role":       user.Role,
		"employeeId": user.EmployeeID,
	})
}

func (h *EmployeeHandler) UpsertUserPassword(c *gin.Context) {
	role, _ := c.Get(middleware.ContextRole)
	if role != "admin" && role != "manager" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var req updateEmployeePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	employeeID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var employee models.Employee
	if err := h.DB.First(&employee, "id = ?", employeeID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "employee not found"})
		return
	}
	if role == "manager" && strings.EqualFold(employee.Role, "manager") {
		c.JSON(http.StatusForbidden, gin.H{"error": "manager cannot manage manager"})
		return
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(employee.Email))

	var user models.User
	if err := h.DB.Where("employee_id = ?", employeeID).First(&user).Error; err == nil {
		passwordHash, err := utils.HashPassword(req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "password error"})
			return
		}
		user.PasswordHash = passwordHash
		user.Role = employee.Role
		user.Email = normalizedEmail
		user.Name = employee.FirstName + " " + employee.LastName
		if err := h.DB.Save(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "updated"})
		return
	} else if err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}

	var existing models.User
	if err := h.DB.Where("email = ?", normalizedEmail).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
		return
	} else if err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "user creation failed"})
		return
	}

	passwordHash, err := utils.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "password error"})
		return
	}

	user = models.User{
		Email:        normalizedEmail,
		PasswordHash: passwordHash,
		Name:         employee.FirstName + " " + employee.LastName,
		Role:         employee.Role,
		EmployeeID:   &employee.ID,
	}

	if err := h.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "user creation failed"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":         user.ID,
		"email":      user.Email,
		"name":       user.Name,
		"role":       user.Role,
		"employeeId": user.EmployeeID,
	})
}
