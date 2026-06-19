# StockSync

StockSync is a full-stack inventory and order management app built with FastAPI, PostgreSQL, React, and Docker.

## What It Includes

- Product, customer, and order CRUD endpoints.
- Unique SKU and customer email enforcement.
- Order creation that calculates totals and reduces product stock.
- Order updates and cancellations that reconcile inventory.
- Low-stock dashboard metrics.
- PostgreSQL persistence with a named Docker volume.
- Production-style frontend build served through Nginx.

## Project Structure

```text
.
├── backend
│   ├── app
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── models.py
│   │   └── schemas.py
│   ├── Dockerfile
│   ├── main.py
│   └── requirements.txt
├── frontend
│   ├── src
│   │   ├── App.css
│   │   ├── App.jsx
│   │   ├── api.js
│   │   └── main.jsx
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
└── .env.example
```

## Run With Docker

Create a `.env` from `.env.example`, then run:

```bash
docker compose up --build
```

The frontend runs at `http://localhost:3000`, the API runs at `http://localhost:8000`, and API docs are available at `http://localhost:8000/docs`.

## Backend Endpoints

```text
GET    /health
GET    /dashboard

POST   /products
GET    /products
GET    /products/{product_id}
PUT    /products/{product_id}
DELETE /products/{product_id}

POST   /customers
GET    /customers
GET    /customers/{customer_id}
PUT    /customers/{customer_id}
DELETE /customers/{customer_id}

POST   /orders
GET    /orders
GET    /orders/{order_id}
PUT    /orders/{order_id}
DELETE /orders/{order_id}
```

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set DATABASE_URL=postgresql+psycopg2://stocksync:stocksync@localhost:5432/stocksync
uvicorn main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Deployment Notes

- Render backend: create a PostgreSQL database, deploy `backend` as the service root, and set `DATABASE_URL` to Render's internal database URL.
- Vercel frontend: deploy `frontend` as the project root and set `VITE_API_URL` to the deployed backend URL.
- Docker Hub backend image:

```bash
docker build -t yourusername/stocksync-backend ./backend
docker login
docker push yourusername/stocksync-backend
```
