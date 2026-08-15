run:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

ci:
	npm ci --prefix apps/web
	npm --prefix apps/web run lint
	npm --prefix apps/web run format:check
	npm --prefix apps/web test
	npm --prefix apps/web run build