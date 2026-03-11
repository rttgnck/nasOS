.PHONY: dev dev-backend dev-frontend dev-electron build clean install lint test

# ===== Development =====

dev: ## Run backend + frontend with hot reload
	@echo "Starting nasOS dev environment..."
	@$(MAKE) dev-backend &
	@$(MAKE) dev-frontend &
	@wait

dev-backend: ## Run FastAPI backend
	cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8080

dev-frontend: ## Run Vite dev server
	cd frontend && npm run dev

dev-electron: ## Run Electron shell (requires dev-backend + dev-frontend running)
	cd electron && npm run dev

# ===== Install =====

install: ## Install all dependencies
	cd backend && pip install -e ".[dev]"
	cd frontend && npm install
	cd electron && npm install

install-backend:
	cd backend && pip install -e ".[dev]"

install-frontend:
	cd frontend && npm install

install-electron:
	cd electron && npm install

# ===== Build =====

build: build-frontend ## Build for production
	@echo "Build complete. Frontend assets in frontend/dist/"

build-frontend:
	cd frontend && npm run build

# ===== Quality =====

lint: ## Run linters
	cd backend && python -m ruff check .
	cd frontend && npm run lint

test: ## Run all tests
	cd backend && python -m pytest tests/ -v
	cd frontend && npx vitest run

# ===== Clean =====

clean: ## Clean build artifacts
	rm -rf frontend/dist
	rm -rf frontend/node_modules/.vite
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# ===== Help =====

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
