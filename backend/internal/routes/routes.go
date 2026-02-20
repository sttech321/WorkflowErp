package routes

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"erp-backend/internal/config"
	"erp-backend/internal/handlers"
	"erp-backend/internal/middleware"
)

func Register(router *gin.Engine, db *gorm.DB, cfg config.Config) {
	router.Use(corsMiddleware(cfg.AllowedOriginsRaw))

	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "workflow-erp-backend"})
	})

	router.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	authHandler := handlers.NewAuthHandler(db, cfg)
	employeeHandler := handlers.NewEmployeeHandler(db)
	invoiceHandler := handlers.NewInvoiceHandler(db)
	attendanceHandler := handlers.NewAttendanceHandler(db)
	dashboardHandler := handlers.NewDashboardHandler(db)
	leaveHandler := handlers.NewLeaveHandler(db)
	settingsHandler := handlers.NewSettingsHandler(db)

	api := router.Group("/api")
	{
		api.POST("/auth/login", authHandler.Login)
		api.POST("/auth/forgot-password/start", authHandler.ForgotPasswordStart)
		api.POST("/auth/forgot-password/verify", authHandler.ForgotPasswordVerify)
		api.POST("/auth/forgot/start", authHandler.ForgotPasswordStart)
		api.POST("/auth/forgot/verify", authHandler.ForgotPasswordVerify)
		api.POST("/auth/reset-password/start", authHandler.ForgotPasswordStart)
		api.POST("/auth/reset-password/verify", authHandler.ForgotPasswordVerify)
		api.POST("/auth/refresh", authHandler.Refresh)
		api.POST("/auth/logout", authHandler.Logout)
	}

	protected := api.Group("/")
	protected.Use(middleware.AuthRequired(cfg.JwtSecret))
	{
		protected.GET("/me", authHandler.Me)
		protected.PUT("/me", authHandler.UpdateProfile)
		protected.PUT("/me/password", authHandler.ChangePassword)
		protected.GET("/dashboard", dashboardHandler.Get)
		protected.GET("/settings/logo", middleware.RequireAnyRole("admin", "manager", "employee"), settingsHandler.GetLogo)
		protected.PUT("/settings/logo", middleware.RequireAnyRole("admin", "manager"), settingsHandler.UpdateLogo)

		protected.GET("/employees", employeeHandler.List)
		protected.POST("/employees", middleware.RequireAnyRole("admin", "manager"), employeeHandler.Create)
		protected.PUT("/employees/:id", middleware.RequireAnyRole("admin", "manager"), employeeHandler.Update)
		protected.DELETE("/employees/:id", middleware.RequireAnyRole("admin", "manager"), employeeHandler.Delete)
		protected.POST("/employees/:id/user", middleware.RequireAnyRole("admin", "manager"), employeeHandler.CreateUser)
		protected.PUT("/employees/:id/user/password", middleware.RequireAnyRole("admin", "manager"), employeeHandler.UpsertUserPassword)

		protected.GET("/invoices", invoiceHandler.List)
		protected.POST("/invoices", middleware.RequireAnyRole("admin", "manager"), invoiceHandler.Create)
		protected.PUT("/invoices/:id", middleware.RequireAnyRole("admin", "manager"), invoiceHandler.Update)
		protected.DELETE("/invoices/:id", middleware.RequireAnyRole("admin", "manager"), invoiceHandler.Delete)

		protected.GET("/attendance", middleware.RequireAnyRole("admin", "manager", "employee"), attendanceHandler.List)
		protected.POST("/attendance/checkin", middleware.RequireAnyRole("admin", "manager", "employee"), attendanceHandler.CheckIn)
		protected.POST("/attendance/break/start", middleware.RequireAnyRole("admin", "manager", "employee"), attendanceHandler.BreakStart)
		protected.POST("/attendance/break/end", middleware.RequireAnyRole("admin", "manager", "employee"), attendanceHandler.BreakEnd)
		protected.POST("/attendance/break/manual", middleware.RequireAnyRole("admin", "manager"), attendanceHandler.AddManualBreak)
		protected.POST("/attendance/manual", middleware.RequireAnyRole("admin", "manager"), attendanceHandler.AddManualBreak)
		protected.POST("/attendance/manual-break", middleware.RequireAnyRole("admin", "manager"), attendanceHandler.AddManualBreak)
		protected.POST("/attendance/breaks/manual", middleware.RequireAnyRole("admin", "manager"), attendanceHandler.AddManualBreak)
		protected.POST("/attendance/start", middleware.RequireAnyRole("admin", "manager", "employee"), attendanceHandler.BreakStart)
		protected.POST("/attendance/end", middleware.RequireAnyRole("admin", "manager", "employee"), attendanceHandler.BreakEnd)
		protected.POST("/attendance/breaks/start", middleware.RequireAnyRole("admin", "manager", "employee"), attendanceHandler.BreakStart)
		protected.POST("/attendance/breaks/end", middleware.RequireAnyRole("admin", "manager", "employee"), attendanceHandler.BreakEnd)
		protected.POST("/attendance/checkout", middleware.RequireAnyRole("admin", "manager", "employee"), attendanceHandler.CheckOut)
		protected.DELETE("/attendance/:id", middleware.RequireAnyRole("admin", "manager"), attendanceHandler.Delete)
		protected.DELETE("/attendance/employee/:employeeId", middleware.RequireAnyRole("admin", "manager"), attendanceHandler.DeleteByEmployee)

		protected.GET("/leave/requests", middleware.RequireAnyRole("admin", "manager", "employee"), leaveHandler.ListRequests)
		protected.POST("/leave/requests", middleware.RequireAnyRole("admin", "manager", "employee"), leaveHandler.CreateRequest)
		protected.PATCH("/leave/requests/:id", middleware.RequireAnyRole("admin", "manager", "employee"), leaveHandler.UpdateRequest)
		protected.PATCH("/leave/requests/:id/pending", middleware.RequireAnyRole("admin", "manager"), leaveHandler.MarkPending)
		protected.PATCH("/leave/requests/:id/approve", middleware.RequireAnyRole("admin", "manager"), leaveHandler.Approve)
		protected.PATCH("/leave/requests/:id/reject", middleware.RequireAnyRole("admin", "manager"), leaveHandler.Reject)
		protected.PATCH("/leave/:id/pending", middleware.RequireAnyRole("admin", "manager"), leaveHandler.MarkPending)
		protected.PATCH("/leave/:id/approve", middleware.RequireAnyRole("admin", "manager"), leaveHandler.Approve)
		protected.PATCH("/leave/:id/reject", middleware.RequireAnyRole("admin", "manager"), leaveHandler.Reject)
		protected.PATCH("/leaves/requests/:id/pending", middleware.RequireAnyRole("admin", "manager"), leaveHandler.MarkPending)
		protected.PATCH("/leaves/requests/:id/approve", middleware.RequireAnyRole("admin", "manager"), leaveHandler.Approve)
		protected.PATCH("/leaves/requests/:id/reject", middleware.RequireAnyRole("admin", "manager"), leaveHandler.Reject)
		protected.DELETE("/leave/requests/:id", middleware.RequireAnyRole("admin", "manager", "employee"), leaveHandler.DeleteRequest)
		protected.GET("/leave/balances", middleware.RequireAnyRole("admin", "manager", "employee"), leaveHandler.ListBalances)
		protected.GET("/leave/policies", middleware.RequireAnyRole("admin", "manager"), leaveHandler.ListPolicies)
		protected.PUT("/leave/policies", middleware.RequireAnyRole("admin", "manager"), leaveHandler.UpdatePolicies)
	}
}

func corsMiddleware(allowed string) gin.HandlerFunc {
	origins := []string{}
	for _, origin := range strings.Split(allowed, ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			origins = append(origins, origin)
		}
	}

	allowAll := len(origins) == 0

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if allowAll {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		} else {
			for _, allowedOrigin := range origins {
				if origin == allowedOrigin {
					c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
					c.Writer.Header().Set("Vary", "Origin")
					break
				}
			}
		}

		c.Writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
