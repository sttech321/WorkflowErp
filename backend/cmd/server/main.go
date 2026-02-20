package main

import (
	"log"

	"github.com/gin-gonic/gin"

	"erp-backend/internal/config"
	"erp-backend/internal/db"
	"erp-backend/internal/routes"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	database, err := db.Open(cfg.DbDsn)
	if err != nil {
		log.Fatalf("db error: %v", err)
	}

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	routes.Register(router, database, cfg)

	if err := router.Run(cfg.Addr); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
