package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"erp-backend/internal/models"
)

type InvoiceHandler struct {
	DB *gorm.DB
}

type createInvoiceRequest struct {
	Number       string  `json:"number" binding:"required"`
	CustomerName string  `json:"customerName" binding:"required"`
	Amount       float64 `json:"amount" binding:"required"`
	Status       string  `json:"status" binding:"required"`
	IssuedAt     string  `json:"issuedAt" binding:"required"`
	DueAt        string  `json:"dueAt" binding:"required"`
}

func NewInvoiceHandler(db *gorm.DB) *InvoiceHandler {
	return &InvoiceHandler{DB: db}
}

func (h *InvoiceHandler) List(c *gin.Context) {
	var invoices []models.Invoice
	if err := h.DB.Order("created_at desc").Find(&invoices).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load invoices"})
		return
	}
	c.JSON(http.StatusOK, invoices)
}

func (h *InvoiceHandler) Create(c *gin.Context) {
	var req createInvoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	issuedAt, err := time.Parse("2006-01-02", req.IssuedAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid issuedAt"})
		return
	}
	dueAt, err := time.Parse("2006-01-02", req.DueAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid dueAt"})
		return
	}

	invoice := models.Invoice{
		Number:       req.Number,
		CustomerName: req.CustomerName,
		Amount:       req.Amount,
		Status:       req.Status,
		IssuedAt:     issuedAt,
		DueAt:        dueAt,
	}

	if err := h.DB.Create(&invoice).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create failed"})
		return
	}

	c.JSON(http.StatusCreated, invoice)
}

func (h *InvoiceHandler) Update(c *gin.Context) {
	var req createInvoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	invoiceID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	issuedAt, err := time.Parse("2006-01-02", req.IssuedAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid issuedAt"})
		return
	}
	dueAt, err := time.Parse("2006-01-02", req.DueAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid dueAt"})
		return
	}

	var invoice models.Invoice
	if err := h.DB.First(&invoice, "id = ?", invoiceID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invoice not found"})
		return
	}

	invoice.Number = req.Number
	invoice.CustomerName = req.CustomerName
	invoice.Amount = req.Amount
	invoice.Status = req.Status
	invoice.IssuedAt = issuedAt
	invoice.DueAt = dueAt

	if err := h.DB.Save(&invoice).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}

	c.JSON(http.StatusOK, invoice)
}

func (h *InvoiceHandler) Delete(c *gin.Context) {
	invoiceID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.DB.Delete(&models.Invoice{}, "id = ?", invoiceID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
