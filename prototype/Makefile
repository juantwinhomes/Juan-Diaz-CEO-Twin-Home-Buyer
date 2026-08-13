.DEFAULT_GOAL := help
.PHONY: help up down reset psql tables views test check

help: ## show this help
	@echo "Plat prototype — local database"
	@echo ""
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  make %-8s %s\n", $$1, $$2}'
	@echo ""
	@echo "Needs Docker Desktop running. Start with: make up"

up: ## start Postgres and apply all migrations
	docker compose up -d
	@printf "waiting for postgres"
	@until docker compose exec -T db pg_isready -U postgres -d plat >/dev/null 2>&1; do \
	  printf "."; sleep 1; done
	@echo " ready"
	@$(MAKE) --no-print-directory tables

down: ## stop the database, keep the data
	docker compose down

reset: ## wipe the data and re-apply migrations from scratch
	docker compose down -v
	@$(MAKE) --no-print-directory up

psql: ## open an interactive SQL prompt
	docker compose exec db psql -U postgres -d plat

tables: ## list the tables that exist
	@docker compose exec -T db psql -U postgres -d plat -c '\dt'

views: ## list the marts (views)
	@docker compose exec -T db psql -U postgres -d plat -c '\dv'

test: ## run the normalization tests (no database needed)
	cd api && python3 -m pytest tests/ -q

check: ## apply migrations to a throwaway database to prove they are valid
	@docker compose exec -T db psql -U postgres -c 'DROP DATABASE IF EXISTS plat_check;' >/dev/null
	@docker compose exec -T db psql -U postgres -c 'CREATE DATABASE plat_check;' >/dev/null
	@for f in db/migrations/*.sql; do \
	  echo "applying $$f"; \
	  docker compose exec -T db psql -U postgres -d plat_check -v ON_ERROR_STOP=1 -q < $$f || exit 1; \
	done
	@docker compose exec -T db psql -U postgres -c 'DROP DATABASE plat_check;' >/dev/null
	@echo "all migrations apply clean"
