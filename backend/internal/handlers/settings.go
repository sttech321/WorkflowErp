package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"erp-backend/internal/models"
)

type SettingsHandler struct {
	DB *gorm.DB
}

type updateLogoRequest struct {
	LogoURL          string `json:"logoUrl"`
	ExpandedLogoURL  string `json:"expandedLogoUrl"`
	CollapsedLogoURL string `json:"collapsedLogoUrl"`
}

const (
	logoSettingKey          = "company_logo"
	expandedLogoSettingKey  = "company_logo_expanded"
	collapsedLogoSettingKey = "company_logo_collapsed"
)

func NewSettingsHandler(db *gorm.DB) *SettingsHandler {
	return &SettingsHandler{DB: db}
}

func (h *SettingsHandler) GetLogo(c *gin.Context) {
	keys := []string{expandedLogoSettingKey, collapsedLogoSettingKey, logoSettingKey}
	var settings []models.Setting
	if err := h.DB.Where("`key` IN ?", keys).Find(&settings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load logo"})
		return
	}

	values := map[string]string{}
	for _, setting := range settings {
		values[setting.Key] = strings.TrimSpace(setting.Value)
	}

	expandedLogoURL := values[expandedLogoSettingKey]
	collapsedLogoURL := values[collapsedLogoSettingKey]
	legacyLogoURL := values[logoSettingKey]
	if expandedLogoURL == "" {
		expandedLogoURL = legacyLogoURL
	}
	if collapsedLogoURL == "" {
		collapsedLogoURL = legacyLogoURL
	}

	c.JSON(http.StatusOK, gin.H{
		"logoUrl":          expandedLogoURL,
		"expandedLogoUrl":  expandedLogoURL,
		"collapsedLogoUrl": collapsedLogoURL,
	})
}

func (h *SettingsHandler) UpdateLogo(c *gin.Context) {
	var req updateLogoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}
	expandedValue := strings.TrimSpace(req.ExpandedLogoURL)
	collapsedValue := strings.TrimSpace(req.CollapsedLogoURL)
	legacyValue := strings.TrimSpace(req.LogoURL)
	if expandedValue == "" && collapsedValue == "" && legacyValue == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "logo cannot be empty"})
		return
	}

	if expandedValue == "" {
		expandedValue = legacyValue
	}
	if collapsedValue == "" {
		collapsedValue = legacyValue
	}

	updates := map[string]string{
		expandedLogoSettingKey:  expandedValue,
		collapsedLogoSettingKey: collapsedValue,
	}

	for key, value := range updates {
		var setting models.Setting
		err := h.DB.Where("`key` = ?", key).Take(&setting).Error
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				setting = models.Setting{Key: key, Value: value}
				if createErr := h.DB.Create(&setting).Error; createErr != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
					return
				}
				continue
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
			return
		}

		setting.Value = value
		if err := h.DB.Save(&setting).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"logoUrl":          expandedValue,
		"expandedLogoUrl":  expandedValue,
		"collapsedLogoUrl": collapsedValue,
	})
}
