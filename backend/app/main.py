import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from .database import get_db, init_db
from .models import Customer, Order, Product
from .schemas import (
    CustomerCreate,
    CustomerRead,
    CustomerUpdate,
    DashboardRead,
    OrderCreate,
    OrderRead,
    OrderUpdate,
    ProductCreate,
    ProductRead,
    ProductUpdate,
)


LOW_STOCK_THRESHOLD = int(os.getenv("LOW_STOCK_THRESHOLD", "5"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="StockSync Inventory and Order API",
    version="1.0.0",
    lifespan=lifespan,
)

raw_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost,http://127.0.0.1:3000,http://127.0.0.1",
)
cors_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
allow_all_origins = "*" in cors_origins or not cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else cors_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def commit_or_400(db: Session, detail: str = "Database constraint violated") -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from exc


def get_product_or_404(db: Session, product_id: int, lock: bool = False) -> Product:
    query = db.query(Product).filter(Product.id == product_id)
    if lock:
        query = query.with_for_update()
    product = query.first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


def get_customer_or_404(db: Session, customer_id: int) -> Customer:
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


def get_order_or_404(db: Session, order_id: int) -> Order:
    order = (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.product))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


def ensure_unique_sku(db: Session, sku: str, exclude_id: int | None = None) -> None:
    query = db.query(Product).filter(Product.sku == sku)
    if exclude_id is not None:
        query = query.filter(Product.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SKU already exists")


def ensure_unique_email(db: Session, email: str, exclude_id: int | None = None) -> None:
    query = db.query(Customer).filter(Customer.email == email)
    if exclude_id is not None:
        query = query.filter(Customer.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")


@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok"}


@app.get("/")
def api_root():
    return {
        "name": "StockSync Inventory and Order API",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
    }


@app.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    ensure_unique_sku(db, product.sku)
    db_product = Product(**product.model_dump())
    db.add(db_product)
    commit_or_400(db, "SKU already exists")
    db.refresh(db_product)
    return db_product


@app.get("/products", response_model=list[ProductRead])
def list_products(db: Session = Depends(get_db)):
    return db.query(Product).order_by(Product.name.asc()).all()


@app.get("/products/{product_id}", response_model=ProductRead)
def get_product(product_id: int, db: Session = Depends(get_db)):
    return get_product_or_404(db, product_id)


@app.put("/products/{product_id}", response_model=ProductRead)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)):
    product = get_product_or_404(db, product_id)
    update_data = payload.model_dump(exclude_unset=True)
    if "sku" in update_data:
        ensure_unique_sku(db, update_data["sku"], exclude_id=product_id)
    for field, value in update_data.items():
        setattr(product, field, value)
    commit_or_400(db)
    db.refresh(product)
    return product


@app.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = get_product_or_404(db, product_id)
    has_orders = db.query(Order.id).filter(Order.product_id == product_id).first()
    if has_orders:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a product that has orders",
        )
    db.delete(product)
    commit_or_400(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/customers", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
def create_customer(customer: CustomerCreate, db: Session = Depends(get_db)):
    ensure_unique_email(db, str(customer.email))
    db_customer = Customer(**customer.model_dump())
    db.add(db_customer)
    commit_or_400(db, "Email already registered")
    db.refresh(db_customer)
    return db_customer


@app.get("/customers", response_model=list[CustomerRead])
def list_customers(db: Session = Depends(get_db)):
    return db.query(Customer).order_by(Customer.name.asc()).all()


@app.get("/customers/{customer_id}", response_model=CustomerRead)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    return get_customer_or_404(db, customer_id)


@app.put("/customers/{customer_id}", response_model=CustomerRead)
def update_customer(customer_id: int, payload: CustomerUpdate, db: Session = Depends(get_db)):
    customer = get_customer_or_404(db, customer_id)
    update_data = payload.model_dump(exclude_unset=True)
    if "email" in update_data:
        ensure_unique_email(db, str(update_data["email"]), exclude_id=customer_id)
    for field, value in update_data.items():
        setattr(customer, field, value)
    commit_or_400(db)
    db.refresh(customer)
    return customer


@app.delete("/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = get_customer_or_404(db, customer_id)
    has_orders = db.query(Order.id).filter(Order.customer_id == customer_id).first()
    if has_orders:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a customer that has orders",
        )
    db.delete(customer)
    commit_or_400(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/orders", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(order: OrderCreate, db: Session = Depends(get_db)):
    customer = get_customer_or_404(db, order.customer_id)
    product = get_product_or_404(db, order.product_id, lock=True)
    if product.stock < order.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient inventory for this order",
        )

    product.stock -= order.quantity
    db_order = Order(
        customer_id=customer.id,
        product_id=product.id,
        quantity=order.quantity,
        unit_price=product.price,
        total_amount=round(product.price * order.quantity, 2),
    )
    db.add(db_order)
    commit_or_400(db)
    db.refresh(db_order)
    return get_order_or_404(db, db_order.id)


@app.get("/orders", response_model=list[OrderRead])
def list_orders(db: Session = Depends(get_db)):
    return (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.product))
        .order_by(Order.created_at.desc())
        .all()
    )


@app.get("/orders/{order_id}", response_model=OrderRead)
def get_order(order_id: int, db: Session = Depends(get_db)):
    return get_order_or_404(db, order_id)


@app.put("/orders/{order_id}", response_model=OrderRead)
def update_order(order_id: int, payload: OrderUpdate, db: Session = Depends(get_db)):
    order = get_order_or_404(db, order_id)
    update_data = payload.model_dump(exclude_unset=True)

    new_customer_id = update_data.get("customer_id", order.customer_id)
    new_product_id = update_data.get("product_id", order.product_id)
    new_quantity = update_data.get("quantity", order.quantity)

    customer = get_customer_or_404(db, new_customer_id)
    old_product = get_product_or_404(db, order.product_id, lock=True)

    if new_product_id == old_product.id:
        available_stock = old_product.stock + order.quantity
        if available_stock < new_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient inventory for this order",
            )
        old_product.stock = available_stock - new_quantity
        product = old_product
    else:
        product = get_product_or_404(db, new_product_id, lock=True)
        if product.stock < new_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient inventory for this order",
            )
        old_product.stock += order.quantity
        product.stock -= new_quantity

    order.customer_id = customer.id
    order.product_id = product.id
    order.quantity = new_quantity
    order.unit_price = product.price
    order.total_amount = round(product.price * new_quantity, 2)
    commit_or_400(db)
    return get_order_or_404(db, order.id)


@app.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = get_order_or_404(db, order_id)
    product = get_product_or_404(db, order.product_id, lock=True)
    product.stock += order.quantity
    db.delete(order)
    commit_or_400(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/dashboard", response_model=DashboardRead)
def dashboard(db: Session = Depends(get_db)):
    products = db.query(Product).all()
    low_stock_products = [product for product in products if product.stock < LOW_STOCK_THRESHOLD]
    revenue = db.query(func.coalesce(func.sum(Order.total_amount), 0)).scalar() or 0

    return {
        "total_products": len(products),
        "total_customers": db.query(Customer).count(),
        "total_orders": db.query(Order).count(),
        "low_stock_count": len(low_stock_products),
        "inventory_value": round(sum(product.price * product.stock for product in products), 2),
        "revenue": round(float(revenue), 2),
        "low_stock_products": low_stock_products,
    }
