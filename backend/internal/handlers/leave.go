package handlers

import (
	"math"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"erp-backend/internal/middleware"
	"erp-backend/internal/models"
)

type LeaveHandler struct {
	DB *gorm.DB
}

type createLeaveRequest struct {
	EmployeeID string `json:"employeeId"`
	Type       string `json:"type" binding:"required"`
	StartDate  string `json:"startDate" binding:"required"`
	EndDate    string `json:"endDate" binding:"required"`
	Reason     string `json:"reason"`
}

type updateLeaveRequest struct {
	Type      string `json:"type" binding:"required"`
	StartDate string `json:"startDate" binding:"required"`
	EndDate   string `json:"endDate" binding:"required"`
	Reason    string `json:"reason"`
}

type updateLeavePoliciesRequest struct {
	Year     int                     `json:"year" binding:"required"`
	Policies []leavePolicyUpdateItem `json:"policies" binding:"required"`
}

type leavePolicyUpdateItem struct {
	Type  string  `json:"type" binding:"required"`
	Total float64 `json:"total" binding:"required"`
}

func NewLeaveHandler(db *gorm.DB) *LeaveHandler {
	return &LeaveHandler{DB: db}
}

func (h *LeaveHandler) ListRequests(c *gin.Context) {
	query := h.DB.Model(&models.LeaveRequest{})
	role, _ := c.Get(middleware.ContextRole)
	if role == "employee" {
		employeeID, ok := c.Get(middleware.ContextEmployeeID)
		if !ok || employeeID == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		query = query.Where("employee_id = ?", employeeID)
	}

	if employeeID := c.Query("employeeId"); employeeID != "" {
		id, err := uuid.Parse(employeeID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid employeeId"})
			return
		}
		query = query.Where("employee_id = ?", id)
	}

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}

	if year := c.Query("year"); year != "" {
		start, err := time.Parse("2006", year)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid year"})
			return
		}
		end := start.AddDate(1, 0, 0)
		query = query.Where("start_date >= ? AND start_date < ?", start, end)
	}

	var requests []models.LeaveRequest
	if err := query.Order("created_at desc").Find(&requests).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load leaves"})
		return
	}

	c.JSON(http.StatusOK, requests)
}

func (h *LeaveHandler) CreateRequest(c *gin.Context) {
	var req createLeaveRequest
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

	leaveType, ok := defaultLeaveTotals()[req.Type]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid leave type"})
		return
	}
	_ = leaveType

	employeeID, err := uuid.Parse(req.EmployeeID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid employeeId"})
		return
	}

	startDate, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid startDate"})
		return
	}
	endDate, err := time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid endDate"})
		return
	}
	if endDate.Before(startDate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "endDate must be after startDate"})
		return
	}
	if startDate.Year() != endDate.Year() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "leave must be within the same year"})
		return
	}

	days := int(endDate.Sub(startDate).Hours()/24) + 1
	if days <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid days"})
		return
	}

	var overlap int64
	if err := h.DB.Model(&models.LeaveRequest{}).
		Where("employee_id = ? AND status != ? AND start_date <= ? AND end_date >= ?", employeeID, "rejected", endDate, startDate).
		Count(&overlap).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "leave check failed"})
		return
	}
	if overlap > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "overlapping leave exists"})
		return
	}

	balance, err := h.ensureBalance(employeeID, startDate.Year(), req.Type)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "balance error"})
		return
	}
	if balance.Total-balance.Used < float64(days) {
		c.JSON(http.StatusConflict, gin.H{"error": "insufficient balance"})
		return
	}

	request := models.LeaveRequest{
		EmployeeID: employeeID,
		Type:       req.Type,
		StartDate:  startDate,
		EndDate:    endDate,
		Days:       float64(days),
		Reason:     req.Reason,
		Status:     "pending",
	}

	if err := h.DB.Create(&request).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create failed"})
		return
	}

	c.JSON(http.StatusCreated, request)
}

func (h *LeaveHandler) Approve(c *gin.Context) {
	requestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var request models.LeaveRequest
	if err := h.DB.First(&request, "id = ?", requestID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "leave not found"})
		return
	}
	previousStatus := request.Status

	balance, err := h.ensureBalance(request.EmployeeID, request.StartDate.Year(), request.Type)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "balance error"})
		return
	}

	if previousStatus != "approved" && balance.Used+request.Days > balance.Total {
		c.JSON(http.StatusConflict, gin.H{"error": "insufficient balance"})
		return
	}

	approverID, ok := c.Get(middleware.ContextUserID)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	approverUUID, err := uuid.Parse(approverID.(string))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	now := time.Now()
	request.Status = "approved"
	request.ApproverID = &approverUUID
	request.ApprovedAt = &now

	if err := h.DB.Transaction(func(tx *gorm.DB) error {
		if previousStatus != "approved" {
			if balance.Used+request.Days > balance.Total {
				return gorm.ErrInvalidData
			}
			balance.Used += request.Days
		}

		if err := tx.Save(&request).Error; err != nil {
			return err
		}
		return tx.Save(&balance).Error
	}); err != nil {
		if err == gorm.ErrInvalidData {
			c.JSON(http.StatusConflict, gin.H{"error": "insufficient balance"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "approve failed"})
		return
	}

	c.JSON(http.StatusOK, request)
}

func (h *LeaveHandler) Reject(c *gin.Context) {
	requestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var request models.LeaveRequest
	if err := h.DB.First(&request, "id = ?", requestID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "leave not found"})
		return
	}
	previousStatus := request.Status

	balance, err := h.ensureBalance(request.EmployeeID, request.StartDate.Year(), request.Type)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "balance error"})
		return
	}

	now := time.Now()
	request.Status = "rejected"
	request.ApproverID = nil
	request.ApprovedAt = &now

	if err := h.DB.Transaction(func(tx *gorm.DB) error {
		if previousStatus == "approved" {
			if balance.Used >= request.Days {
				balance.Used -= request.Days
			} else {
				balance.Used = 0
			}
		}
		if err := tx.Save(&request).Error; err != nil {
			return err
		}
		return tx.Save(&balance).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "reject failed"})
		return
	}

	c.JSON(http.StatusOK, request)
}

func (h *LeaveHandler) MarkPending(c *gin.Context) {
	requestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var request models.LeaveRequest
	if err := h.DB.First(&request, "id = ?", requestID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "leave not found"})
		return
	}
	previousStatus := request.Status

	balance, err := h.ensureBalance(request.EmployeeID, request.StartDate.Year(), request.Type)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "balance error"})
		return
	}

	request.Status = "pending"
	request.ApproverID = nil
	request.ApprovedAt = nil

	if err := h.DB.Transaction(func(tx *gorm.DB) error {
		if previousStatus == "approved" {
			if balance.Used >= request.Days {
				balance.Used -= request.Days
			} else {
				balance.Used = 0
			}
		}
		if err := tx.Save(&request).Error; err != nil {
			return err
		}
		return tx.Save(&balance).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "pending update failed"})
		return
	}

	c.JSON(http.StatusOK, request)
}

func (h *LeaveHandler) UpdateRequest(c *gin.Context) {
	requestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var request models.LeaveRequest
	if err := h.DB.First(&request, "id = ?", requestID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "leave not found"})
		return
	}

	if request.Status != "pending" {
		c.JSON(http.StatusConflict, gin.H{"error": "leave is not pending"})
		return
	}

	role, _ := c.Get(middleware.ContextRole)
	if role == "employee" {
		employeeID, ok := c.Get(middleware.ContextEmployeeID)
		if !ok || employeeID == "" || request.EmployeeID.String() != employeeID.(string) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
	}

	var req updateLeaveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	leaveType, ok := defaultLeaveTotals()[req.Type]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid leave type"})
		return
	}
	_ = leaveType

	startDate, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid startDate"})
		return
	}
	endDate, err := time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid endDate"})
		return
	}
	if endDate.Before(startDate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "endDate must be after startDate"})
		return
	}
	if startDate.Year() != endDate.Year() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "leave must be within the same year"})
		return
	}

	days := int(endDate.Sub(startDate).Hours()/24) + 1
	if days <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid days"})
		return
	}

	var overlap int64
	if err := h.DB.Model(&models.LeaveRequest{}).
		Where("employee_id = ? AND id <> ? AND status != ? AND start_date <= ? AND end_date >= ?",
			request.EmployeeID, request.ID, "rejected", endDate, startDate).
		Count(&overlap).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "leave check failed"})
		return
	}
	if overlap > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "overlapping leave exists"})
		return
	}

	balance, err := h.ensureBalance(request.EmployeeID, startDate.Year(), req.Type)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "balance error"})
		return
	}
	if balance.Total-balance.Used < float64(days) {
		c.JSON(http.StatusConflict, gin.H{"error": "insufficient balance"})
		return
	}

	request.Type = req.Type
	request.StartDate = startDate
	request.EndDate = endDate
	request.Days = float64(days)
	request.Reason = req.Reason

	if err := h.DB.Save(&request).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}

	c.JSON(http.StatusOK, request)
}

func (h *LeaveHandler) DeleteRequest(c *gin.Context) {
	requestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var request models.LeaveRequest
	if err := h.DB.First(&request, "id = ?", requestID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "leave not found"})
		return
	}

	role, _ := c.Get(middleware.ContextRole)
	if role == "employee" {
		employeeID, ok := c.Get(middleware.ContextEmployeeID)
		if !ok || employeeID == "" || request.EmployeeID.String() != employeeID.(string) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
	}

	if request.Status == "approved" {
		c.JSON(http.StatusConflict, gin.H{"error": "approved leave cannot be deleted"})
		return
	}

	if err := h.DB.Delete(&models.LeaveRequest{}, "id = ?", requestID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *LeaveHandler) ListBalances(c *gin.Context) {
	query := h.DB.Model(&models.LeaveBalance{})
	role, _ := c.Get(middleware.ContextRole)

	year := time.Now().Year()
	if yearParam := c.Query("year"); yearParam != "" {
		start, err := time.Parse("2006", yearParam)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid year"})
			return
		}
		year = start.Year()
	}

	var targetEmployeeIDs []uuid.UUID
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
		targetEmployeeIDs = []uuid.UUID{id}
		query = query.Where("employee_id = ?", id)
	} else if employeeID := c.Query("employeeId"); employeeID != "" {
		id, err := uuid.Parse(employeeID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid employeeId"})
			return
		}
		targetEmployeeIDs = []uuid.UUID{id}
		query = query.Where("employee_id = ?", id)
	} else {
		var employees []models.Employee
		if err := h.DB.Find(&employees).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load employees"})
			return
		}
		targetEmployeeIDs = make([]uuid.UUID, 0, len(employees))
		for _, employee := range employees {
			targetEmployeeIDs = append(targetEmployeeIDs, employee.ID)
		}
	}

	for _, employeeID := range targetEmployeeIDs {
		for leaveType := range defaultLeaveTotals() {
			_, _ = h.ensureBalance(employeeID, year, leaveType)
		}
	}

	query = query.Where("year = ?", year)

	var balances []models.LeaveBalance
	if err := query.Order("year desc, type asc").Find(&balances).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load balances"})
		return
	}

	if len(balances) > 0 {
		employeeIDs := make([]uuid.UUID, 0, len(balances))
		for _, balance := range balances {
			employeeIDs = append(employeeIDs, balance.EmployeeID)
		}

		var employees []models.Employee
		if err := h.DB.Where("id IN ?", employeeIDs).Find(&employees).Error; err == nil {
			employeeByID := make(map[uuid.UUID]models.Employee, len(employees))
			for _, employee := range employees {
				employeeByID[employee.ID] = employee
			}

			type policyKey struct {
				year int
				kind string
			}
			policyCache := make(map[policyKey]float64)

			for index := range balances {
				balance := &balances[index]
				employee, ok := employeeByID[balance.EmployeeID]
				if !ok {
					continue
				}

				key := policyKey{year: balance.Year, kind: balance.Type}
				policyTotal, ok := policyCache[key]
				if !ok {
					total, err := h.getPolicyTotal(balance.Year, balance.Type)
					if err != nil {
						continue
					}
					policyTotal = total
					policyCache[key] = total
				}

				desiredTotal := proratedTotal(policyTotal, employee.HiredAt, balance.Year)
				if desiredTotal != balance.Total {
					_ = h.DB.Model(&models.LeaveBalance{}).
						Where("id = ?", balance.ID).
						Update("total", desiredTotal).Error
					balance.Total = desiredTotal
				}
			}
		}
	}

	c.JSON(http.StatusOK, balances)
}

func (h *LeaveHandler) ListPolicies(c *gin.Context) {
	role, _ := c.Get(middleware.ContextRole)
	if role != "admin" && role != "manager" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	query := h.DB.Model(&models.LeavePolicy{})
	if year := c.Query("year"); year != "" {
		parsed, err := time.Parse("2006", year)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid year"})
			return
		}
		query = query.Where("year = ?", parsed.Year())
	}

	var policies []models.LeavePolicy
	if err := query.Order("year desc, type asc").Find(&policies).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load policies"})
		return
	}

	c.JSON(http.StatusOK, policies)
}

func (h *LeaveHandler) UpdatePolicies(c *gin.Context) {
	role, _ := c.Get(middleware.ContextRole)
	if role != "admin" && role != "manager" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var req updateLeavePoliciesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
		return
	}

	validTypes := defaultLeaveTotals()

	if err := h.DB.Transaction(func(tx *gorm.DB) error {
		for _, policy := range req.Policies {
			if _, ok := validTypes[policy.Type]; !ok {
				return gorm.ErrRecordNotFound
			}
			var existing models.LeavePolicy
			if err := tx.Where("year = ? AND type = ?", req.Year, policy.Type).First(&existing).Error; err != nil {
				if err == gorm.ErrRecordNotFound {
					newPolicy := models.LeavePolicy{
						Year:  req.Year,
						Type:  policy.Type,
						Total: policy.Total,
					}
					if err := tx.Create(&newPolicy).Error; err != nil {
						return err
					}
				} else {
					return err
				}
			} else {
				existing.Total = policy.Total
				if err := tx.Save(&existing).Error; err != nil {
					return err
				}
			}

			var balances []models.LeaveBalance
			if err := tx.Where("year = ? AND type = ?", req.Year, policy.Type).Find(&balances).Error; err != nil {
				return err
			}

			if len(balances) == 0 {
				continue
			}

			employeeIDs := make([]uuid.UUID, 0, len(balances))
			for _, balance := range balances {
				employeeIDs = append(employeeIDs, balance.EmployeeID)
			}

			var employees []models.Employee
			if err := tx.Where("id IN ?", employeeIDs).Find(&employees).Error; err != nil {
				return err
			}
			employeeByID := make(map[uuid.UUID]models.Employee, len(employees))
			for _, employee := range employees {
				employeeByID[employee.ID] = employee
			}

			for _, balance := range balances {
				employee, ok := employeeByID[balance.EmployeeID]
				if !ok {
					continue
				}
				total := proratedTotal(policy.Total, employee.HiredAt, balance.Year)
				if err := tx.Model(&models.LeaveBalance{}).
					Where("id = ?", balance.ID).
					Update("total", total).Error; err != nil {
					return err
				}
			}
		}
		return nil
	}); err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid leave type"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *LeaveHandler) ensureBalance(employeeID uuid.UUID, year int, leaveType string) (models.LeaveBalance, error) {
	var balance models.LeaveBalance
	if err := h.DB.Where("employee_id = ? AND year = ? AND type = ?", employeeID, year, leaveType).
		First(&balance).Error; err == nil {
		policyTotal, err := h.getPolicyTotal(year, leaveType)
		if err != nil {
			return balance, err
		}

		var employee models.Employee
		if err := h.DB.First(&employee, "id = ?", employeeID).Error; err != nil {
			return balance, err
		}

		desiredTotal := proratedTotal(policyTotal, employee.HiredAt, year)
		if desiredTotal != balance.Total {
			if err := h.DB.Model(&models.LeaveBalance{}).
				Where("id = ?", balance.ID).
				Update("total", desiredTotal).Error; err != nil {
				return balance, err
			}
			balance.Total = desiredTotal
		}
		return balance, nil
	} else if err != nil && err != gorm.ErrRecordNotFound {
		return balance, err
	}

	defaultTotal, err := h.getPolicyTotal(year, leaveType)
	if err != nil {
		return balance, err
	}

	var employee models.Employee
	if err := h.DB.First(&employee, "id = ?", employeeID).Error; err != nil {
		return balance, err
	}

	prorated := proratedTotal(defaultTotal, employee.HiredAt, year)

	balance = models.LeaveBalance{
		EmployeeID: employeeID,
		Year:       year,
		Type:       leaveType,
		Total:      prorated,
		Used:       0,
	}

	if err := h.DB.Create(&balance).Error; err != nil {
		return balance, err
	}

	return balance, nil
}

func defaultLeaveTotals() map[string]float64 {
	return map[string]float64{
		"sick":   10,
		"casual": 7,
	}
}

func proratedTotal(policyTotal float64, hiredAt time.Time, year int) float64 {
	if hiredAt.IsZero() {
		return policyTotal
	}
	if hiredAt.Year() < year {
		return policyTotal
	}
	if hiredAt.Year() > year {
		return 0
	}

	monthsRemaining := 12 - int(hiredAt.Month()) + 1
	if monthsRemaining < 0 {
		monthsRemaining = 0
	} else if monthsRemaining > 12 {
		monthsRemaining = 12
	}

	perMonth := policyTotal / 12
	total := perMonth * float64(monthsRemaining)
	return math.Round(total*100) / 100
}

func (h *LeaveHandler) getPolicyTotal(year int, leaveType string) (float64, error) {
	totals := defaultLeaveTotals()
	defaultTotal, ok := totals[leaveType]
	if !ok {
		return 0, gorm.ErrRecordNotFound
	}

	var policy models.LeavePolicy
	if err := h.DB.Where("year = ? AND type = ?", year, leaveType).First(&policy).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return defaultTotal, nil
		}
		return 0, err
	}

	return policy.Total, nil
}
