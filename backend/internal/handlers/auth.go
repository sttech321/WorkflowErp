package handlers

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"erp-backend/internal/config"
	"erp-backend/internal/email"
	"erp-backend/internal/middleware"
	"erp-backend/internal/models"
	"erp-backend/internal/utils"
)

type AuthHandler struct {
	DB  *gorm.DB
	Cfg config.Config
}

type registerStartRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type registerVerifyRequest struct {
	Email    string `json:"email" binding:"required,email"`
	OTP      string `json:"otp" binding:"required,len=6"`
	Password string `json:"password" binding:"required,min=8"`
	Name     string `json:"name" binding:"required,min=2"`
	Role     string `json:"role" binding:"required,oneof=admin manager"`
}

type registerOTPVerifyRequest struct {
	Email string `json:"email" binding:"required,email"`
	OTP   string `json:"otp" binding:"required,len=6"`
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type forgotPasswordStartRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type forgotPasswordVerifyRequest struct {
	Email       string `json:"email" binding:"required,email"`
	OTP         string `json:"otp" binding:"required,len=6"`
	NewPassword string `json:"newPassword" binding:"required,min=8"`
}

type refreshRequest struct {
	RefreshToken string `json:"refreshToken" binding:"required"`
}

type updateProfileRequest struct {
	Name      string `json:"name" binding:"required,min=2"`
	Phone     string `json:"phone"`
	Position  string `json:"position"`
	AvatarURL string `json:"avatarUrl"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" binding:"required"`
	NewPassword     string `json:"newPassword" binding:"required,min=8"`
}

func NewAuthHandler(db *gorm.DB, cfg config.Config) *AuthHandler {
	return &AuthHandler{DB: db, Cfg: cfg}
}

func (h *AuthHandler) RegisterStart(c *gin.Context) {
	var req registerStartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	var existing models.User
	if err := h.DB.Where("email = ?", strings.ToLower(req.Email)).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
		return
	}

	code, err := utils.GenerateOTP()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "otp generation failed"})
		return
	}
	codeHash, err := utils.HashOTP(code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "otp generation failed"})
		return
	}

	expiresAt := time.Now().Add(time.Duration(h.Cfg.OtpMinutes) * time.Minute)
	otp := models.OTP{
		Email:     strings.ToLower(req.Email),
		CodeHash:  codeHash,
		ExpiresAt: expiresAt,
	}
	if err := h.DB.Create(&otp).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "otp storage failed"})
		return
	}

	smtpCfg := email.Config{
		Host:     h.Cfg.SmtpHost,
		Port:     h.Cfg.SmtpPort,
		Username: h.Cfg.SmtpUser,
		Password: h.Cfg.SmtpPass,
		From:     h.Cfg.SmtpFrom,
	}
	if err := email.SendOTP(smtpCfg, req.Email, code); err != nil {
		log.Printf("smtp send error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "email failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "otp sent"})
}

func (h *AuthHandler) RegisterVerify(c *gin.Context) {
	var req registerVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	var otp models.OTP
	if err := h.DB.Where("email = ? AND used_at IS NULL AND expires_at > ?", strings.ToLower(req.Email), time.Now()).
		Order("created_at desc").First(&otp).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "otp invalid or expired"})
		return
	}

	if !utils.CheckOTP(otp.CodeHash, req.OTP) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "otp invalid or expired"})
		return
	}

	passwordHash, err := utils.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "password error"})
		return
	}

	role := "manager"
	if strings.EqualFold(req.Role, "admin") {
		if h.Cfg.AdminBootstrap != "" && strings.EqualFold(h.Cfg.AdminBootstrap, req.Email) {
			role = "admin"
		}
	} else {
		role = "manager"
	}

	user := models.User{
		Email:        strings.ToLower(req.Email),
		PasswordHash: passwordHash,
		Name:         req.Name,
		Role:         role,
	}
	if err := h.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "user creation failed"})
		return
	}

	now := time.Now()
	otp.UsedAt = &now
	_ = h.DB.Save(&otp).Error

	employeeID := ""
	if user.EmployeeID != nil {
		employeeID = user.EmployeeID.String()
	}
	accessToken, refreshToken, err := h.issueTokens(user.ID, user.Role, employeeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
		"user": gin.H{
			"id":        user.ID,
			"email":     user.Email,
			"name":      user.Name,
			"role":      user.Role,
			"avatarUrl": user.AvatarURL,
		},
	})
}

func (h *AuthHandler) RegisterVerifyOTP(c *gin.Context) {
	var req registerOTPVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	var otp models.OTP
	if err := h.DB.Where("email = ? AND used_at IS NULL AND expires_at > ?", strings.ToLower(req.Email), time.Now()).
		Order("created_at desc").First(&otp).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "otp invalid or expired"})
		return
	}

	if !utils.CheckOTP(otp.CodeHash, req.OTP) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "otp invalid or expired"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "otp verified"})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	var user models.User
	if err := h.DB.Where("email = ?", strings.ToLower(req.Email)).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if !utils.CheckPassword(user.PasswordHash, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	employeeID := ""
	if user.EmployeeID != nil {
		employeeID = user.EmployeeID.String()
	}
	accessToken, refreshToken, err := h.issueTokens(user.ID, user.Role, employeeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
		"user": gin.H{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.Name,
			"role":  user.Role,
		},
	})
}

func (h *AuthHandler) ForgotPasswordStart(c *gin.Context) {
	var req forgotPasswordStartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(req.Email))
	var user models.User
	if err := h.DB.Where("email = ?", normalizedEmail).First(&user).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "if account exists, otp sent"})
		return
	}

	code, err := utils.GenerateOTP()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "otp generation failed"})
		return
	}
	codeHash, err := utils.HashOTP(code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "otp generation failed"})
		return
	}

	expiresAt := time.Now().Add(time.Duration(h.Cfg.OtpMinutes) * time.Minute)
	otp := models.OTP{
		Email:     normalizedEmail,
		CodeHash:  codeHash,
		ExpiresAt: expiresAt,
	}
	if err := h.DB.Create(&otp).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "otp storage failed"})
		return
	}

	smtpCfg := email.Config{
		Host:     h.Cfg.SmtpHost,
		Port:     h.Cfg.SmtpPort,
		Username: h.Cfg.SmtpUser,
		Password: h.Cfg.SmtpPass,
		From:     h.Cfg.SmtpFrom,
	}
	if err := email.SendOTP(smtpCfg, normalizedEmail, code); err != nil {
		log.Printf("smtp send error: %v", err)
		if strings.EqualFold(h.Cfg.AppEnv, "production") {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "email failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "otp generated (dev mode)", "devOtp": code})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "otp sent"})
}

func (h *AuthHandler) ForgotPasswordVerify(c *gin.Context) {
	var req forgotPasswordVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(req.Email))

	var otp models.OTP
	if err := h.DB.Where("email = ? AND used_at IS NULL AND expires_at > ?", normalizedEmail, time.Now()).
		Order("created_at desc").First(&otp).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "otp invalid or expired"})
		return
	}

	if !utils.CheckOTP(otp.CodeHash, req.OTP) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "otp invalid or expired"})
		return
	}

	var user models.User
	if err := h.DB.Where("email = ?", normalizedEmail).First(&user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "account not found"})
		return
	}

	newHash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "password error"})
		return
	}

	now := time.Now()
	if err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.User{}).Where("id = ?", user.ID).Update("password_hash", newHash).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.OTP{}).Where("id = ?", otp.ID).Update("used_at", now).Error; err != nil {
			return err
		}
		return tx.Model(&models.RefreshToken{}).
			Where("user_id = ? AND revoked_at IS NULL", user.ID).
			Update("revoked_at", now).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "reset failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password reset successful"})
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	var token models.RefreshToken
	if err := h.DB.Where("token = ? AND revoked_at IS NULL AND expires_at > ?", req.RefreshToken, time.Now()).First(&token).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh"})
		return
	}

	var user models.User
	if err := h.DB.First(&user, "id = ?", token.UserID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh"})
		return
	}

	employeeID := ""
	if user.EmployeeID != nil {
		employeeID = user.EmployeeID.String()
	}
	accessToken, err := utils.GenerateAccessToken(user.ID.String(), user.Role, employeeID, h.Cfg.JwtSecret, h.Cfg.JwtAccessMinutes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"accessToken": accessToken})
}

func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserID)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	parsedUserID, err := uuid.Parse(userID.(string))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	var user models.User
	if err := h.DB.First(&user, "id = ?", parsedUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	user.Name = req.Name
	user.AvatarURL = strings.TrimSpace(req.AvatarURL)
	if err := h.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}

	phone := strings.TrimSpace(req.Phone)
	position := strings.TrimSpace(req.Position)
	if user.EmployeeID != nil {
		var employee models.Employee
		if err := h.DB.First(&employee, "id = ?", user.EmployeeID).Error; err == nil {
			employee.Phone = phone
			employee.Position = position
			_ = h.DB.Save(&employee).Error
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         user.ID,
		"email":      user.Email,
		"name":       user.Name,
		"role":       user.Role,
		"avatarUrl":  user.AvatarURL,
		"employeeId": user.EmployeeID,
		"phone":      phone,
		"position":   position,
	})
}

func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserID)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	parsedUserID, err := uuid.Parse(userID.(string))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	var user models.User
	if err := h.DB.First(&user, "id = ?", parsedUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if !utils.CheckPassword(user.PasswordHash, req.CurrentPassword) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "current password is incorrect"})
		return
	}

	newHash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "password error"})
		return
	}

	user.PasswordHash = newHash
	if err := h.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	now := time.Now()
	h.DB.Model(&models.RefreshToken{}).
		Where("token = ? AND revoked_at IS NULL", req.RefreshToken).
		Update("revoked_at", now)

	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID, ok := c.Get("userId")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var user models.User
	if err := h.DB.First(&user, "id = ?", userID.(string)).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var employee models.Employee
	if user.EmployeeID != nil {
		_ = h.DB.First(&employee, "id = ?", user.EmployeeID).Error
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         user.ID,
		"email":      user.Email,
		"name":       user.Name,
		"role":       user.Role,
		"avatarUrl":  user.AvatarURL,
		"employeeId": user.EmployeeID,
		"phone":      employee.Phone,
		"position":   employee.Position,
	})
}

func (h *AuthHandler) issueTokens(userID uuid.UUID, role string, employeeID string) (string, string, error) {
	accessToken, err := utils.GenerateAccessToken(userID.String(), role, employeeID, h.Cfg.JwtSecret, h.Cfg.JwtAccessMinutes)
	if err != nil {
		return "", "", err
	}

	refreshToken, err := utils.GenerateRefreshToken()
	if err != nil {
		return "", "", err
	}

	expiresAt := time.Now().Add(time.Duration(h.Cfg.JwtRefreshHours) * time.Hour)
	if err := h.DB.Create(&models.RefreshToken{
		UserID:    userID,
		Token:     refreshToken,
		ExpiresAt: expiresAt,
	}).Error; err != nil {
		return "", "", err
	}

	return accessToken, refreshToken, nil
}
