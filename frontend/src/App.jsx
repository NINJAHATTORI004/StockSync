import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  PackagePlus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Users,
} from 'lucide-react';

import { api, getErrorMessage } from './api.js';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const emptyProduct = { name: '', sku: '', price: '', stock: '' };
const emptyCustomer = { name: '', email: '', phone: '' };
const emptyOrder = { customer_id: '', product_id: '', quantity: 1 };

function App() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [orderForm, setOrderForm] = useState(emptyOrder);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardRes, productsRes, customersRes, ordersRes] = await Promise.all([
        api.get('/dashboard'),
        api.get('/products'),
        api.get('/customers'),
        api.get('/orders'),
      ]);

      setDashboard(dashboardRes.data);
      setProducts(productsRes.data);
      setCustomers(customersRes.data);
      setOrders(ordersRes.data);
      setNotice(null);
    } catch (error) {
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedProduct = useMemo(
    () => products.find((product) => String(product.id) === String(orderForm.product_id)),
    [orderForm.product_id, products],
  );

  const orderPreview = selectedProduct
    ? currency.format(Number(selectedProduct.price) * Number(orderForm.quantity || 0))
    : currency.format(0);

  async function runMutation(label, action, successText) {
    setBusy(label);
    try {
      await action();
      await fetchData();
      setNotice({ type: 'success', text: successText });
    } catch (error) {
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }

  function handleProductChange(event) {
    setProductForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function handleCustomerChange(event) {
    setCustomerForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function handleOrderChange(event) {
    setOrderForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function submitProduct(event) {
    event.preventDefault();
    runMutation(
      'product',
      async () => {
        await api.post('/products', {
          ...productForm,
          price: Number(productForm.price),
          stock: Number(productForm.stock),
        });
        setProductForm(emptyProduct);
      },
      'Product added.',
    );
  }

  function submitCustomer(event) {
    event.preventDefault();
    runMutation(
      'customer',
      async () => {
        await api.post('/customers', {
          ...customerForm,
          phone: customerForm.phone || null,
        });
        setCustomerForm(emptyCustomer);
      },
      'Customer added.',
    );
  }

  function submitOrder(event) {
    event.preventDefault();
    runMutation(
      'order',
      async () => {
        await api.post('/orders', {
          customer_id: Number(orderForm.customer_id),
          product_id: Number(orderForm.product_id),
          quantity: Number(orderForm.quantity),
        });
        setOrderForm(emptyOrder);
      },
      'Order created and stock updated.',
    );
  }

  function deleteProduct(product) {
    if (!window.confirm(`Delete ${product.name}?`)) return;
    runMutation('delete-product', () => api.delete(`/products/${product.id}`), 'Product deleted.');
  }

  function deleteCustomer(customer) {
    if (!window.confirm(`Delete ${customer.name}?`)) return;
    runMutation('delete-customer', () => api.delete(`/customers/${customer.id}`), 'Customer deleted.');
  }

  function deleteOrder(order) {
    if (!window.confirm(`Cancel order #${order.id}? Stock will be returned.`)) return;
    runMutation('delete-order', () => api.delete(`/orders/${order.id}`), 'Order canceled and stock returned.');
  }

  const metrics = [
    {
      label: 'Products',
      value: dashboard?.total_products ?? products.length,
      icon: Boxes,
      tone: 'blue',
    },
    {
      label: 'Customers',
      value: dashboard?.total_customers ?? customers.length,
      icon: Users,
      tone: 'teal',
    },
    {
      label: 'Orders',
      value: dashboard?.total_orders ?? orders.length,
      icon: ClipboardList,
      tone: 'violet',
    },
    {
      label: 'Low stock',
      value: dashboard?.low_stock_count ?? products.filter((product) => product.stock < 5).length,
      icon: AlertTriangle,
      tone: 'amber',
    },
    {
      label: 'Inventory value',
      value: currency.format(dashboard?.inventory_value ?? 0),
      icon: PackagePlus,
      tone: 'green',
    },
    {
      label: 'Revenue',
      value: currency.format(dashboard?.revenue ?? 0),
      icon: CircleDollarSign,
      tone: 'rose',
    },
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Inventory and order management</p>
          <h1>StockSync</h1>
        </div>
        <button className="icon-button" type="button" onClick={fetchData} title="Refresh data" disabled={loading}>
          <RefreshCw size={20} />
        </button>
      </header>

      {notice && (
        <div className={`notice ${notice.type}`} role="status" aria-live="polite">
          {notice.text}
        </div>
      )}

      <section className="summary-grid" aria-label="Dashboard summary">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className={`metric ${metric.tone}`} key={metric.label}>
              <div className="metric-icon">
                <Icon size={20} />
              </div>
              <span>{metric.label}</span>
              <strong>{loading ? '...' : metric.value}</strong>
            </article>
          );
        })}
      </section>

      <section className="workbench">
        <form className="surface form-surface" onSubmit={submitProduct}>
          <h2>Add Product</h2>
          <label>
            Name
            <input name="name" value={productForm.name} onChange={handleProductChange} required />
          </label>
          <label>
            SKU
            <input name="sku" value={productForm.sku} onChange={handleProductChange} required />
          </label>
          <div className="field-row">
            <label>
              Price
              <input
                name="price"
                type="number"
                min="0.01"
                step="0.01"
                value={productForm.price}
                onChange={handleProductChange}
                required
              />
            </label>
            <label>
              Stock
              <input
                name="stock"
                type="number"
                min="0"
                step="1"
                value={productForm.stock}
                onChange={handleProductChange}
                required
              />
            </label>
          </div>
          <button className="primary-button" type="submit" disabled={busy === 'product'}>
            <PackagePlus size={18} />
            Add product
          </button>
        </form>

        <form className="surface form-surface" onSubmit={submitCustomer}>
          <h2>Add Customer</h2>
          <label>
            Name
            <input name="name" value={customerForm.name} onChange={handleCustomerChange} required />
          </label>
          <label>
            Email
            <input name="email" type="email" value={customerForm.email} onChange={handleCustomerChange} required />
          </label>
          <label>
            Phone
            <input name="phone" value={customerForm.phone} onChange={handleCustomerChange} />
          </label>
          <button className="primary-button" type="submit" disabled={busy === 'customer'}>
            <Users size={18} />
            Add customer
          </button>
        </form>

        <form className="surface form-surface" onSubmit={submitOrder}>
          <h2>Create Order</h2>
          <label>
            Customer
            <select name="customer_id" value={orderForm.customer_id} onChange={handleOrderChange} required>
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Product
            <select name="product_id" value={orderForm.product_id} onChange={handleOrderChange} required>
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id} disabled={product.stock === 0}>
                  {product.name} ({product.stock} in stock)
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label>
              Quantity
              <input
                name="quantity"
                type="number"
                min="1"
                step="1"
                value={orderForm.quantity}
                onChange={handleOrderChange}
                required
              />
            </label>
            <div className="total-preview">
              <span>Total</span>
              <strong>{orderPreview}</strong>
            </div>
          </div>
          <button className="primary-button" type="submit" disabled={busy === 'order'}>
            <ShoppingCart size={18} />
            Create order
          </button>
        </form>
      </section>

      <section className="data-grid">
        <div className="surface table-surface">
          <div className="section-heading">
            <h2>Products</h2>
            <span>{products.length}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.sku}</td>
                    <td>{currency.format(product.price)}</td>
                    <td>
                      <span className={`stock-pill ${product.stock < 5 ? 'low' : ''}`}>{product.stock}</span>
                    </td>
                    <td>
                      <button
                        className="icon-button subtle"
                        type="button"
                        onClick={() => deleteProduct(product)}
                        title="Delete product"
                      >
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!products.length && (
                  <tr>
                    <td colSpan="5" className="empty-cell">
                      No products yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="surface table-surface">
          <div className="section-heading">
            <h2>Customers</h2>
            <span>{customers.length}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{customer.email}</td>
                    <td>{customer.phone || '-'}</td>
                    <td>
                      <button
                        className="icon-button subtle"
                        type="button"
                        onClick={() => deleteCustomer(customer)}
                        title="Delete customer"
                      >
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!customers.length && (
                  <tr>
                    <td colSpan="4" className="empty-cell">
                      No customers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="data-grid orders-grid">
        <div className="surface table-surface">
          <div className="section-heading">
            <h2>Orders</h2>
            <span>{orders.length}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Total</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>#{order.id}</td>
                    <td>{order.customer?.name || `Customer ${order.customer_id}`}</td>
                    <td>{order.product?.name || `Product ${order.product_id}`}</td>
                    <td>{order.quantity}</td>
                    <td>{currency.format(order.total_amount)}</td>
                    <td>
                      <button
                        className="icon-button subtle"
                        type="button"
                        onClick={() => deleteOrder(order)}
                        title="Cancel order"
                      >
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!orders.length && (
                  <tr>
                    <td colSpan="6" className="empty-cell">
                      No orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="surface alert-surface">
          <div className="section-heading">
            <h2>Low Stock</h2>
            <span>{dashboard?.low_stock_count ?? 0}</span>
          </div>
          <ul className="low-stock-list">
            {(dashboard?.low_stock_products || []).map((product) => (
              <li key={product.id}>
                <div>
                  <strong>{product.name}</strong>
                  <span>{product.sku}</span>
                </div>
                <span className="stock-pill low">{product.stock}</span>
              </li>
            ))}
            {!(dashboard?.low_stock_products || []).length && <li className="empty-list">Stock levels are healthy.</li>}
          </ul>
        </div>
      </section>
    </main>
  );
}

export default App;
